import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any, Dict, List

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .qwen import QwenDemoEngine
from .schemas import (
    CharacterPreset,
    CharacterPresetCreateRequest,
    ClonePromptCreateFromSampleRequest,
    ClonePromptCreateFromUploadRequest,
    ClonePromptRecord,
    CustomVoiceRequest,
    FineTuneDataset,
    FineTuneDatasetCreateRequest,
    FineTuneRun,
    FineTuneRunCreateRequest,
    GenerationRecord,
    GenerationResponse,
    HealthResponse,
    ModelInfo,
    PrepareDatasetRequest,
    PresetGenerateRequest,
    VoiceCloneRequest,
    VoiceDesignRequest,
)
from .storage import Storage, utc_now

APP_DIR = Path(__file__).resolve().parent
BACKEND_DIR = APP_DIR.parent
REPO_ROOT = BACKEND_DIR.parent.parent
UPSTREAM_QWEN_DIR = REPO_ROOT / "Qwen3-TTS" / "finetuning"

storage = Storage(REPO_ROOT)
engine = QwenDemoEngine(storage)

app = FastAPI(title="Qwen3-TTS Demo API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/files", StaticFiles(directory=storage.data_dir), name="files")


def audio_url_for(relative_path: str) -> str:
    prefix = "data/"
    if relative_path.startswith(prefix):
        relative_path = relative_path[len(prefix):]
    return f"/files/{relative_path.replace(os.sep, '/')}"


def save_generation_record(payload: Dict[str, Any]) -> Dict[str, Any]:
    record_path = storage.generated_dir / f"{payload['id']}.json"
    storage.write_json(record_path, payload)
    return payload


def build_generation_record(
    record_id: str,
    mode: str,
    text: str,
    language: str,
    audio_path: Path,
    speaker: str = "",
    instruction: str = "",
    preset_id: str = "",
    source_ref_audio_path: str = "",
    source_ref_text: str = "",
    meta: Dict[str, Any] = None,
) -> Dict[str, Any]:
    meta = meta or {}
    rel_audio_path = storage.relpath(audio_path)
    return {
        "id": record_id,
        "mode": mode,
        "input_text": text,
        "language": language,
        "speaker": speaker or None,
        "instruction": instruction or None,
        "preset_id": preset_id or None,
        "output_audio_path": rel_audio_path,
        "output_audio_url": audio_url_for(rel_audio_path),
        "source_ref_audio_path": source_ref_audio_path or None,
        "source_ref_text": source_ref_text or None,
        "created_at": utc_now(),
        "meta": meta,
    }


def get_generation_record(record_id: str) -> Dict[str, Any]:
    payload = storage.get_record(storage.generated_dir, record_id)
    if not payload:
        raise HTTPException(status_code=404, detail="Generation record not found.")
    return payload


def get_preset_record(preset_id: str) -> Dict[str, Any]:
    payload = storage.get_record(storage.presets_dir, preset_id)
    if not payload:
        raise HTTPException(status_code=404, detail="Preset not found.")
    return payload


def get_dataset_record(dataset_id: str) -> Dict[str, Any]:
    payload = storage.get_record(storage.datasets_dir, dataset_id)
    if not payload:
        raise HTTPException(status_code=404, detail="Dataset not found.")
    return payload


@app.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        simulation_mode=engine.simulation_mode,
        qwen_tts_available=engine.qwen_tts_available,
        data_dir=str(storage.data_dir),
    )


@app.get("/api/models", response_model=List[ModelInfo])
def list_models() -> List[ModelInfo]:
    return [
        ModelInfo(
            key="custom_voice",
            label="CustomVoice 1.7B",
            model_id=os.getenv("QWEN_DEMO_CUSTOM_MODEL", "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice"),
            supports_instruction=True,
            notes="빠른 음질 확인과 기본 화자 선택용",
        ),
        ModelInfo(
            key="voice_design",
            label="VoiceDesign 1.7B",
            model_id=os.getenv("QWEN_DEMO_DESIGN_MODEL", "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign"),
            supports_instruction=True,
            notes="설명문 기반 새 목소리 설계용",
        ),
        ModelInfo(
            key="base_clone",
            label="Base 1.7B",
            model_id=os.getenv("QWEN_DEMO_BASE_MODEL", "Qwen/Qwen3-TTS-12Hz-1.7B-Base"),
            supports_instruction=False,
            notes="clone prompt 재사용 및 파인튜닝용",
        ),
    ]


@app.get("/api/speakers")
def list_speakers() -> List[Dict[str, str]]:
    return engine.supported_speakers()


@app.get("/api/history", response_model=List[GenerationRecord])
def history() -> List[GenerationRecord]:
    records = storage.list_json_records(storage.generated_dir)
    return [GenerationRecord(**record) for record in records]


@app.post("/api/uploads/reference-audio")
async def upload_reference_audio(file: UploadFile = File(...)) -> Dict[str, str]:
    file_id = storage.new_id("upload")
    extension = Path(file.filename or "reference.wav").suffix or ".wav"
    destination = storage.uploads_dir / f"{file_id}{extension}"
    contents = await file.read()
    destination.write_bytes(contents)
    rel_path = storage.relpath(destination)
    return {
        "id": file_id,
        "path": rel_path,
        "url": audio_url_for(rel_path),
        "filename": file.filename or destination.name,
    }


@app.post("/api/generate/custom-voice", response_model=GenerationResponse)
def generate_custom_voice(payload: CustomVoiceRequest) -> GenerationResponse:
    audio_path, _, meta = engine.generate_custom_voice(
        text=payload.text,
        language=payload.language,
        speaker=payload.speaker,
        instruct=payload.instruct,
    )
    record_id = storage.new_id("gen")
    record = build_generation_record(
        record_id=record_id,
        mode="custom_voice",
        text=payload.text,
        language=payload.language,
        audio_path=audio_path,
        speaker=payload.speaker,
        instruction=payload.instruct,
        meta=meta,
    )
    save_generation_record(record)
    return GenerationResponse(record=GenerationRecord(**record))


@app.post("/api/generate/voice-design", response_model=GenerationResponse)
def generate_voice_design(payload: VoiceDesignRequest) -> GenerationResponse:
    audio_path, _, meta = engine.generate_voice_design(
        text=payload.text,
        language=payload.language,
        instruct=payload.instruct,
    )
    record_id = storage.new_id("gen")
    record = build_generation_record(
        record_id=record_id,
        mode="voice_design",
        text=payload.text,
        language=payload.language,
        audio_path=audio_path,
        instruction=payload.instruct,
        meta=meta,
    )
    save_generation_record(record)
    return GenerationResponse(record=GenerationRecord(**record))


@app.post("/api/generate/voice-clone", response_model=GenerationResponse)
def generate_voice_clone(payload: VoiceCloneRequest) -> GenerationResponse:
    preset = None
    ref_audio_path = payload.ref_audio_path or ""
    ref_text = payload.ref_text or ""
    voice_clone_prompt_path = payload.voice_clone_prompt_path or ""

    if payload.preset_id:
        preset = get_preset_record(payload.preset_id)
        ref_audio_path = preset["reference_audio_path"]
        ref_text = preset["reference_text"]
        voice_clone_prompt_path = preset["clone_prompt_path"]

    if not voice_clone_prompt_path and not (ref_audio_path and ref_text):
        raise HTTPException(status_code=400, detail="Preset or clone prompt/reference inputs are required.")

    audio_path, _, meta = engine.generate_voice_clone(
        text=payload.text,
        language=payload.language,
        ref_audio_path=ref_audio_path,
        ref_text=ref_text,
        voice_clone_prompt_path=voice_clone_prompt_path,
        x_vector_only_mode=payload.x_vector_only_mode,
    )
    record_id = storage.new_id("gen")
    record = build_generation_record(
        record_id=record_id,
        mode="voice_clone",
        text=payload.text,
        language=payload.language,
        audio_path=audio_path,
        preset_id=payload.preset_id or "",
        source_ref_audio_path=ref_audio_path,
        source_ref_text=ref_text,
        meta=meta,
    )
    save_generation_record(record)
    return GenerationResponse(record=GenerationRecord(**record))


@app.post("/api/clone-prompts/from-generated-sample", response_model=ClonePromptRecord)
def clone_prompt_from_generated_sample(payload: ClonePromptCreateFromSampleRequest) -> ClonePromptRecord:
    generation = get_generation_record(payload.generation_id)

    if generation["mode"] != "voice_design":
        raise HTTPException(status_code=400, detail="Only voice design samples can be promoted from generated history.")

    reference_audio_path = generation["output_audio_path"]
    reference_text = generation["input_text"]
    prompt_id = storage.new_id("clone")
    prompt_path = storage.clone_prompts_dir / f"{prompt_id}.pkl"

    if engine.simulation_mode or not engine.qwen_tts_available:
        import pickle

        with prompt_path.open("wb") as handle:
            pickle.dump(
                {
                    "kind": "simulation",
                    "reference_audio_path": reference_audio_path,
                    "reference_text": reference_text,
                    "x_vector_only_mode": payload.x_vector_only_mode,
                },
                handle,
            )
    else:
        import pickle

        model = engine._get_model("base_clone", os.getenv("QWEN_DEMO_BASE_MODEL", "Qwen/Qwen3-TTS-12Hz-1.7B-Base"))
        prompt_payload = model.create_voice_clone_prompt(
            ref_audio=str(REPO_ROOT / reference_audio_path),
            ref_text=reference_text,
            x_vector_only_mode=payload.x_vector_only_mode,
        )
        with prompt_path.open("wb") as handle:
            pickle.dump(prompt_payload, handle)

    record = {
        "id": prompt_id,
        "source_type": "generated_voice_design",
        "prompt_path": storage.relpath(prompt_path),
        "reference_audio_path": reference_audio_path,
        "reference_text": reference_text,
        "x_vector_only_mode": payload.x_vector_only_mode,
        "created_at": utc_now(),
        "meta": {"generation_id": payload.generation_id},
    }
    storage.write_json(storage.clone_prompts_dir / f"{prompt_id}.json", record)
    return ClonePromptRecord(**record)


@app.post("/api/clone-prompts/from-upload", response_model=ClonePromptRecord)
def clone_prompt_from_upload(payload: ClonePromptCreateFromUploadRequest) -> ClonePromptRecord:
    prompt_id = storage.new_id("clone")
    prompt_path = storage.clone_prompts_dir / f"{prompt_id}.pkl"

    if engine.simulation_mode or not engine.qwen_tts_available:
        import pickle

        with prompt_path.open("wb") as handle:
            pickle.dump(
                {
                    "kind": "simulation",
                    "reference_audio_path": payload.reference_audio_path,
                    "reference_text": payload.reference_text,
                    "x_vector_only_mode": payload.x_vector_only_mode,
                },
                handle,
            )
    else:
        import pickle

        model = engine._get_model("base_clone", os.getenv("QWEN_DEMO_BASE_MODEL", "Qwen/Qwen3-TTS-12Hz-1.7B-Base"))
        prompt_payload = model.create_voice_clone_prompt(
            ref_audio=str(REPO_ROOT / payload.reference_audio_path),
            ref_text=payload.reference_text,
            x_vector_only_mode=payload.x_vector_only_mode,
        )
        with prompt_path.open("wb") as handle:
            pickle.dump(prompt_payload, handle)

    record = {
        "id": prompt_id,
        "source_type": "uploaded_reference",
        "prompt_path": storage.relpath(prompt_path),
        "reference_audio_path": payload.reference_audio_path,
        "reference_text": payload.reference_text,
        "x_vector_only_mode": payload.x_vector_only_mode,
        "created_at": utc_now(),
        "meta": {},
    }
    storage.write_json(storage.clone_prompts_dir / f"{prompt_id}.json", record)
    return ClonePromptRecord(**record)


@app.get("/api/presets", response_model=List[CharacterPreset])
def list_presets() -> List[CharacterPreset]:
    records = storage.list_json_records(storage.presets_dir)
    return [CharacterPreset(**record) for record in records]


@app.post("/api/presets", response_model=CharacterPreset)
def create_preset(payload: CharacterPresetCreateRequest) -> CharacterPreset:
    preset_id = storage.new_id("preset")
    record = {
        "id": preset_id,
        "name": payload.name,
        "source_type": payload.source_type,
        "base_model": payload.base_model,
        "language": payload.language,
        "reference_text": payload.reference_text,
        "reference_audio_path": payload.reference_audio_path,
        "clone_prompt_path": payload.clone_prompt_path,
        "created_at": utc_now(),
        "notes": payload.notes,
    }
    storage.write_json(storage.presets_dir / f"{preset_id}.json", record)
    return CharacterPreset(**record)


@app.get("/api/presets/{preset_id}", response_model=CharacterPreset)
def get_preset(preset_id: str) -> CharacterPreset:
    return CharacterPreset(**get_preset_record(preset_id))


@app.post("/api/presets/{preset_id}/generate", response_model=GenerationResponse)
def generate_from_preset(preset_id: str, payload: PresetGenerateRequest) -> GenerationResponse:
    preset = get_preset_record(preset_id)
    request = VoiceCloneRequest(
        text=payload.text,
        language=payload.language or preset["language"],
        preset_id=preset_id,
    )
    return generate_voice_clone(request)


@app.post("/api/datasets", response_model=FineTuneDataset)
def create_dataset(payload: FineTuneDatasetCreateRequest) -> FineTuneDataset:
    if not payload.samples:
        raise HTTPException(status_code=400, detail="At least one sample is required.")

    dataset_id = storage.new_id("dataset")
    raw_jsonl_path = storage.datasets_dir / f"{dataset_id}_raw.jsonl"
    jsonl_lines = []
    for sample in payload.samples:
        jsonl_lines.append(
            json.dumps(
                {
                    "audio": sample.audio_path,
                    "text": sample.text,
                    "ref_audio": payload.ref_audio_path,
                },
                ensure_ascii=False,
            )
        )
    raw_jsonl_path.write_text("\n".join(jsonl_lines) + "\n", encoding="utf-8")

    record = {
        "id": dataset_id,
        "name": payload.name,
        "source_type": payload.source_type,
        "raw_jsonl_path": storage.relpath(raw_jsonl_path),
        "prepared_jsonl_path": None,
        "ref_audio_path": payload.ref_audio_path,
        "speaker_name": payload.speaker_name,
        "sample_count": len(payload.samples),
        "created_at": utc_now(),
    }
    storage.write_json(storage.datasets_dir / f"{dataset_id}.json", record)
    return FineTuneDataset(**record)


@app.get("/api/datasets", response_model=List[FineTuneDataset])
def list_datasets() -> List[FineTuneDataset]:
    records = storage.list_json_records(storage.datasets_dir)
    return [FineTuneDataset(**record) for record in records]


@app.get("/api/datasets/{dataset_id}", response_model=FineTuneDataset)
def get_dataset(dataset_id: str) -> FineTuneDataset:
    return FineTuneDataset(**get_dataset_record(dataset_id))


@app.post("/api/datasets/{dataset_id}/prepare-codes", response_model=FineTuneDataset)
def prepare_dataset(dataset_id: str, payload: PrepareDatasetRequest) -> FineTuneDataset:
    dataset = get_dataset_record(dataset_id)
    raw_jsonl_path = REPO_ROOT / dataset["raw_jsonl_path"]
    prepared_jsonl_path = storage.datasets_dir / f"{dataset_id}_with_codes.jsonl"

    simulate = payload.simulate_only or engine.simulation_mode
    if not simulate:
        if not UPSTREAM_QWEN_DIR.exists():
            raise HTTPException(status_code=400, detail="Upstream finetuning directory is missing.")

        command = [
            "python3",
            "prepare_data.py",
            "--device",
            payload.device,
            "--tokenizer_model_path",
            payload.tokenizer_model_path,
            "--input_jsonl",
            str(raw_jsonl_path),
            "--output_jsonl",
            str(prepared_jsonl_path),
        ]
        result = subprocess.run(
            command,
            cwd=str(UPSTREAM_QWEN_DIR),
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise HTTPException(status_code=500, detail=result.stderr or result.stdout or "prepare_data.py failed")
    else:
        lines = []
        for line in raw_jsonl_path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            row = json.loads(line)
            row["audio_codes"] = [101, 202, 303, 404]
            lines.append(json.dumps(row, ensure_ascii=False))
        prepared_jsonl_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    dataset["prepared_jsonl_path"] = storage.relpath(prepared_jsonl_path)
    storage.write_json(storage.datasets_dir / f"{dataset_id}.json", dataset)
    return FineTuneDataset(**dataset)


@app.post("/api/finetune-runs", response_model=FineTuneRun)
def create_finetune_run(payload: FineTuneRunCreateRequest) -> FineTuneRun:
    dataset = get_dataset_record(payload.dataset_id)
    prepared_jsonl_path = dataset.get("prepared_jsonl_path")
    if not prepared_jsonl_path:
        raise HTTPException(status_code=400, detail="Dataset must be prepared before starting fine-tuning.")

    run_id = storage.new_id("run")
    run_dir = storage.finetune_runs_dir / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    output_model_path = run_dir / payload.output_name
    log_path = run_dir / "train.log"

    status = "completed"
    command: List[str] = []

    simulate = payload.simulate_only or engine.simulation_mode
    if not simulate:
        if not UPSTREAM_QWEN_DIR.exists():
            raise HTTPException(status_code=400, detail="Upstream finetuning directory is missing.")
        command = [
            "python3",
            "sft_12hz.py",
            "--init_model_path",
            payload.init_model_path,
            "--output_model_path",
            str(output_model_path),
            "--train_jsonl",
            str(REPO_ROOT / prepared_jsonl_path),
            "--batch_size",
            str(payload.batch_size),
            "--lr",
            str(payload.lr),
            "--num_epochs",
            str(payload.num_epochs),
            "--speaker_name",
            payload.speaker_name,
        ]
        result = subprocess.run(
            command,
            cwd=str(UPSTREAM_QWEN_DIR),
            capture_output=True,
            text=True,
        )
        log_path.write_text((result.stdout or "") + "\n" + (result.stderr or ""), encoding="utf-8")
        if result.returncode != 0:
            status = "failed"
        else:
            status = "completed"
    else:
        output_model_path.mkdir(parents=True, exist_ok=True)
        (output_model_path / "README.txt").write_text(
            "Simulation mode checkpoint placeholder.\n",
            encoding="utf-8",
        )
        log_path.write_text("Simulation mode fine-tuning completed.\n", encoding="utf-8")
        status = "completed"

    record = {
        "id": run_id,
        "dataset_id": payload.dataset_id,
        "init_model_path": payload.init_model_path,
        "output_model_path": storage.relpath(output_model_path),
        "batch_size": payload.batch_size,
        "lr": payload.lr,
        "num_epochs": payload.num_epochs,
        "speaker_name": payload.speaker_name,
        "status": status,
        "created_at": utc_now(),
        "finished_at": utc_now(),
        "log_path": storage.relpath(log_path),
        "command": command,
    }
    storage.write_json(storage.finetune_runs_dir / f"{run_id}.json", record)
    return FineTuneRun(**record)


@app.get("/api/finetune-runs", response_model=List[FineTuneRun])
def list_finetune_runs() -> List[FineTuneRun]:
    records = storage.list_json_records(storage.finetune_runs_dir)
    return [FineTuneRun(**record) for record in records]


@app.get("/api/finetune-runs/{run_id}", response_model=FineTuneRun)
def get_finetune_run(run_id: str) -> FineTuneRun:
    payload = storage.get_record(storage.finetune_runs_dir, run_id)
    if not payload:
        raise HTTPException(status_code=404, detail="Fine-tuning run not found.")
    return FineTuneRun(**payload)
