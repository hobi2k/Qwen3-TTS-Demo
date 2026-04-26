"""Qwen3-TTS integration helpers and simulation fallback logic."""

import importlib.util
import math
import os
import pickle
import random
import re
import struct
import sys
import wave
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from .storage import Storage

try:
    import soundfile as sf  # type: ignore
except Exception:  # pragma: no cover
    sf = None


class QwenDemoEngine:
    """실제 Qwen3-TTS 모델과 시뮬레이션 대체 경로를 함께 관리한다.

    Args:
        storage: 생성 파일 저장에 사용할 스토리지 객체.
    """

    def __init__(self, storage: Storage):
        """런타임 상태를 초기화하고 가능한 경우 모델 로더를 준비한다.

        Args:
            storage: 생성 파일 저장에 사용할 스토리지 객체.
        """

        self.storage = storage
        self._qwen_available = False
        self._torch: Optional[Any] = None
        self._Qwen3TTSModel: Optional[Any] = None
        self._transcription_pipeline: Optional[Any] = None
        self._models: Dict[str, Any] = {}
        self._bootstrap()
        configured_simulation = os.getenv("QWEN_DEMO_SIMULATION")
        if configured_simulation is None:
            self.simulation_mode = not self._qwen_available
        else:
            self.simulation_mode = configured_simulation.lower() not in {"0", "false", "no"}

    @property
    def qwen_tts_available(self) -> bool:
        """실제 `qwen_tts` 런타임을 현재 프로세스가 사용할 수 있는지 반환한다.

        Returns:
            `qwen_tts` import 성공 여부.
        """

        return self._qwen_available

    def _bootstrap(self) -> None:
        """선택적 의존성을 불러와 실제 모델 사용 가능 여부를 판별한다."""

        try:
            import torch  # type: ignore
            from qwen_tts import Qwen3TTSModel  # type: ignore

            self._torch = torch
            self._Qwen3TTSModel = Qwen3TTSModel
            self._qwen_available = True
        except Exception:
            # 데모는 모델 라이브러리가 없어도 시뮬레이션 모드로 계속 동작해야 한다.
            self._qwen_available = False

    def _get_model(self, key: str, model_id: str) -> Optional[Any]:
        """모델 인스턴스를 캐시에서 재사용하거나 새로 로드한다.

        Args:
            key: 내부 캐시 키.
            model_id: Hugging Face 또는 로컬 모델 식별자.

        Returns:
            로드된 모델 객체 또는 시뮬레이션 시 `None`.
        """

        cache_key = f"{key}:{model_id}"
        if cache_key in self._models:
            return self._models[cache_key]

        if not self._qwen_available or self.simulation_mode:
            return None

        # 환경 변수가 명시되지 않았다면 flash-attn 설치 여부에 따라
        # 안전한 attention 구현을 자동 선택해 실서버가 기본 설정으로도 뜨게 한다.
        attn_implementation = self.resolve_attention_implementation()

        dtype = getattr(self._torch, "bfloat16", None)
        model = self._Qwen3TTSModel.from_pretrained(
            model_id,
            device_map=self.resolve_device(),
            dtype=dtype,
            attn_implementation=attn_implementation,
        )
        self._models[cache_key] = model
        return model

    def _apply_seed(self, seed: Optional[int]) -> None:
        """가능한 난수원을 같은 시드로 맞춘다."""

        if seed is None:
            return

        random.seed(seed)
        np.random.seed(seed % (2**32 - 1))

        if self._torch is None:
            return

        self._torch.manual_seed(seed)
        if bool(self._torch.cuda.is_available()):
            self._torch.cuda.manual_seed_all(seed)

    def _generated_audio_path(self, category: str, label: str, output_name: str = "") -> Path:
        """읽기 쉬운 생성 오디오 경로를 만든다."""

        preferred_name = (output_name or "").strip()
        return self.storage.named_output_path(
            root=self.storage.generated_dir,
            category=category,
            label=preferred_name or label or category,
            extension="wav",
            include_time=not bool(preferred_name),
        )

    def resolve_device(self) -> str:
        """실행 환경에 맞는 device 문자열을 계산한다."""

        configured = os.getenv("QWEN_DEMO_DEVICE")
        if configured:
            return configured

        if self._torch is None:
            return "cpu"

        if bool(self._torch.cuda.is_available()):
            return "cuda:0"

        mps_backend = getattr(self._torch.backends, "mps", None)
        if mps_backend is not None and bool(mps_backend.is_available()):
            return "mps"

        return "cpu"

    def resolve_attention_implementation(self) -> str:
        """환경에 맞는 attention 구현을 계산한다."""

        if os.getenv("QWEN_DEMO_ATTN_IMPL"):
            return os.getenv("QWEN_DEMO_ATTN_IMPL", "flash_attention_2")

        device = self.resolve_device()
        if sys.platform == "darwin" or device in {"cpu", "mps"}:
            return "sdpa"

        # Linux + CUDA 환경에서는 검증이 끝난 FlashAttention 2 wheel을 우선 사용한다.
        # 이 저장소는 WSL/Linux + torch cu130 조합에서 flash_attn v2 GPU smoke test를
        # 직접 통과한 상태를 기준선으로 삼는다.
        if device.startswith("cuda") and importlib.util.find_spec("flash_attn"):
            return "flash_attention_2"
        return "sdpa"

    def resolve_transcription_model_id(self) -> str:
        """Whisper 전사에 사용할 모델 식별자를 계산한다."""

        configured = os.getenv("QWEN_DEMO_TRANSCRIBE_MODEL")
        if configured:
            return configured

        local_path = self.storage.repo_root / "data" / "models" / "whisper-large-v3"
        if local_path.exists():
            return str(local_path)

        return "openai/whisper-large-v3"

    def _transcription_fallback_text(self, audio_path: str) -> str:
        """전사 모델을 쓸 수 없을 때 파일명 기반 안내 텍스트를 만든다."""

        stem = Path(audio_path).stem
        normalized = re.sub(r"[_\\-]+", " ", stem).strip()
        if normalized:
            return f"[auto-transcript placeholder] {normalized}"
        return "[auto-transcript placeholder]"

    def _get_transcription_pipeline(self) -> Any:
        """Whisper ASR 파이프라인을 캐시에서 재사용하거나 새로 준비한다.

        Returns:
            로드된 transformers ASR 파이프라인.
        """

        if self._transcription_pipeline is not None:
            return self._transcription_pipeline

        from transformers import pipeline  # type: ignore

        model_id = self.resolve_transcription_model_id()
        device: int | str = -1
        dtype = None

        if self._torch is not None:
            if bool(self._torch.cuda.is_available()):
                device = 0
                dtype = getattr(self._torch, "float16", None)
            else:
                mps_backend = getattr(self._torch.backends, "mps", None)
                if mps_backend is not None and bool(mps_backend.is_available()):
                    device = "mps"
                    dtype = getattr(self._torch, "float16", None)

        self._transcription_pipeline = pipeline(
            task="automatic-speech-recognition",
            model=model_id,
            device=device,
            dtype=dtype,
        )
        if hasattr(self._transcription_pipeline, "model") and hasattr(self._transcription_pipeline.model, "generation_config"):
            generation_config = self._transcription_pipeline.model.generation_config
            if hasattr(generation_config, "forced_decoder_ids"):
                generation_config.forced_decoder_ids = None
        return self._transcription_pipeline

    def supported_speakers(self) -> List[Dict[str, str]]:
        """데모 UI에 노출할 기본 화자 목록을 반환한다.

        Returns:
            프런트엔드 셀렉트 박스에 바로 사용할 수 있는 화자 메타데이터 목록.
        """

        return [
            {"speaker": "Vivian", "nativeLanguage": "Chinese", "description": "Bright, slightly edgy young female voice."},
            {"speaker": "Serena", "nativeLanguage": "Chinese", "description": "Warm, gentle young female voice."},
            {"speaker": "Uncle_Fu", "nativeLanguage": "Chinese", "description": "Seasoned male voice with a low, mellow timbre."},
            {"speaker": "Dylan", "nativeLanguage": "Chinese", "description": "Youthful Beijing male voice with a clear, natural timbre."},
            {"speaker": "Eric", "nativeLanguage": "Chinese", "description": "Lively Chengdu male voice with a slightly husky brightness."},
            {"speaker": "Ryan", "nativeLanguage": "English", "description": "Dynamic male voice with strong rhythmic drive."},
            {"speaker": "Aiden", "nativeLanguage": "English", "description": "Sunny American male voice with a clear midrange."},
            {"speaker": "Ono_Anna", "nativeLanguage": "Japanese", "description": "Playful Japanese female voice with a light, nimble timbre."},
            {"speaker": "Sohee", "nativeLanguage": "Korean", "description": "Warm Korean female voice with rich emotion."},
        ]

    def transcribe_reference_audio(self, audio_path: str) -> Dict[str, Any]:
        """저장된 음성 파일을 Whisper로 전사한다.

        Args:
            audio_path: 프로젝트 루트 기준 상대 경로 또는 절대 경로.

        Returns:
            전사 텍스트와 전사 메타데이터.
        """

        absolute_path = Path(audio_path)
        if not absolute_path.is_absolute():
            absolute_path = self.storage.repo_root / audio_path

        if not absolute_path.exists():
            raise FileNotFoundError(f"Audio file not found: {audio_path}")

        if self.simulation_mode:
            return {
                "text": self._transcription_fallback_text(audio_path),
                "language": None,
                "simulation": True,
                "model_id": None,
            }

        pipeline_runner = self._get_transcription_pipeline()
        pipeline_input: Any = str(absolute_path)

        if sf is not None:
            try:
                audio_array, sample_rate = sf.read(str(absolute_path), dtype="float32")
                if isinstance(audio_array, np.ndarray) and audio_array.ndim > 1:
                    audio_array = audio_array.mean(axis=1)
                pipeline_input = {
                    "raw": np.asarray(audio_array, dtype=np.float32),
                    "sampling_rate": int(sample_rate),
                }
            except Exception:
                # `soundfile`로 읽기 실패하면 기존 filename 경로 방식을 마지막으로 시도한다.
                pipeline_input = str(absolute_path)

        result = pipeline_runner(
            pipeline_input,
            generate_kwargs={"task": "transcribe"},
        )
        text = str(result.get("text", "")).strip()
        if not text:
            raise RuntimeError("Whisper did not return any transcript.")

        return {
            "text": text,
            "language": result.get("language"),
            "simulation": False,
            "model_id": self.resolve_transcription_model_id(),
        }

    def _fake_wave(self, text: str, destination: Path, variant: str) -> int:
        """입력 텍스트를 기반으로 결정적인 테스트용 WAV 파일을 생성한다.

        Args:
            text: 길이와 시드 계산에 사용할 입력 문장.
            destination: 생성할 WAV 파일 경로.
            variant: 모드별 파형 차이를 위한 시드 힌트.

        Returns:
            생성된 WAV 파일의 샘플링 레이트.
        """

        sample_rate = 22050
        seed = sum(ord(char) for char in f"{variant}:{text}")
        random.seed(seed)
        duration_seconds = max(1.6, min(8.0, len(text) * 0.045))
        frame_count = int(sample_rate * duration_seconds)
        base_frequency = 180 + (seed % 120)
        amplitude = 0.28

        with wave.open(str(destination), "w") as handle:
            handle.setnchannels(1)
            handle.setsampwidth(2)
            handle.setframerate(sample_rate)

            # 단순 사인파에 페이드인/아웃과 약한 wobble을 섞어
            # 생성 모드마다 구분 가능한 테스트 음원을 만든다.
            for index in range(frame_count):
                time_position = index / sample_rate
                envelope = min(1.0, index / 2500.0) * min(1.0, (frame_count - index) / 2500.0)
                wobble = 0.2 * math.sin(2 * math.pi * 2.0 * time_position)
                sample = amplitude * envelope * math.sin(2 * math.pi * (base_frequency + wobble * 25) * time_position)
                pcm = max(-32767, min(32767, int(sample * 32767)))
                handle.writeframes(struct.pack("<h", pcm))

        return sample_rate

    def _write_wav(self, wav: Any, sample_rate: int, destination: Path) -> None:
        """모델 출력을 WAV 파일로 저장한다.

        Args:
            wav: 모델이 반환한 waveform 배열.
            sample_rate: waveform의 샘플링 레이트.
            destination: 저장할 WAV 경로.
        """

        if sf is not None:
            sf.write(str(destination), wav, sample_rate)
            return

        # `soundfile`이 없을 때도 API 계약을 지키기 위해 대체 파일을 남긴다.
        self._fake_wave("fallback", destination, "fallback")

    def _wave_metrics(self, wav: Any, sample_rate: int) -> Dict[str, float]:
        """Waveform의 길이와 에너지 지표를 계산한다.

        Args:
            wav: 생성된 waveform 배열.
            sample_rate: waveform의 샘플링 레이트.

        Returns:
            duration, rms, peak를 포함한 간단한 지표.
        """

        array = np.asarray(wav, dtype=np.float32)
        if array.ndim > 1:
            array = array.mean(axis=1)
        if array.size == 0 or sample_rate <= 0:
            return {"duration_sec": 0.0, "rms": 0.0, "peak": 0.0}

        return {
            "duration_sec": float(array.shape[0] / sample_rate),
            "rms": float(np.sqrt(np.mean(np.square(array), dtype=np.float32))),
            "peak": float(np.max(np.abs(array))),
        }

    def _finalize_generated_wav(self, wav: Any, sample_rate: int) -> Tuple[np.ndarray, Dict[str, Any]]:
        """후처리와 무음 방지를 함께 적용해 저장용 waveform을 확정한다.

        모델 출력이 너무 짧거나 거의 무음이면 에러로 간주한다. 또한
        후처리 결과가 원본보다 지나치게 약해지면 원본을 보존한다.

        Args:
            wav: 모델이 반환한 원본 waveform.
            sample_rate: waveform 샘플링 레이트.

        Returns:
            저장할 waveform과 후처리/검증 메타데이터.
        """

        raw = np.asarray(wav, dtype=np.float32)
        processed, post = self._postprocess_generated_wav(raw, sample_rate)

        raw_metrics = self._wave_metrics(raw, sample_rate)
        processed_metrics = self._wave_metrics(processed, sample_rate)

        # trim/fade 후 에너지가 비정상적으로 크게 줄어들면 원본을 보존한다.
        if raw_metrics["rms"] > 0.0 and processed_metrics["rms"] < raw_metrics["rms"] * 0.1:
            processed = raw
            processed_metrics = raw_metrics
            post = {
                "leading_trim_samples": 0,
                "fade_in_samples": 0,
                "reverted_to_raw": True,
            }
        else:
            post["reverted_to_raw"] = False

        min_duration_sec = float(os.getenv("QWEN_DEMO_MIN_AUDIO_DURATION_SEC", "0.25"))
        min_rms = float(os.getenv("QWEN_DEMO_MIN_AUDIO_RMS", "0.003"))
        min_peak = float(os.getenv("QWEN_DEMO_MIN_AUDIO_PEAK", "0.02"))
        invalid = (
            processed_metrics["duration_sec"] < min_duration_sec
            or processed_metrics["rms"] < min_rms
            or processed_metrics["peak"] < min_peak
        )
        if invalid:
            raise RuntimeError(
                "Generated audio was too short or near-silent "
                f"(duration={processed_metrics['duration_sec']:.3f}s, "
                f"rms={processed_metrics['rms']:.6f}, peak={processed_metrics['peak']:.6f})."
            )

        return processed, {
            "postprocess": post,
            "audio_metrics": processed_metrics,
            "raw_audio_metrics": raw_metrics,
        }

    def _postprocess_generated_wav(self, wav: Any, sample_rate: int) -> Tuple[np.ndarray, Dict[str, Any]]:
        """생성 WAV의 아주 짧은 앞머리 저에너지 구간만 보수적으로 정리한다.

        모델 출력 자체를 크게 바꾸지 않기 위해 아래 원칙만 적용한다.

        - 앞부분 35ms 이내만 검사
        - 10ms RMS 기준으로 충분히 작은 프리롤만 trim
        - trim이 있었을 때만 4ms fade-in 적용
        """

        array = np.asarray(wav, dtype=np.float32)
        if array.ndim == 0:
            return array.reshape(1), {"leading_trim_samples": 0, "fade_in_samples": 0}

        mono = array if array.ndim == 1 else array[:, 0]
        if mono.size == 0:
            return array, {"leading_trim_samples": 0, "fade_in_samples": 0}

        window = max(1, int(sample_rate * 0.010))
        max_trim = max(1, int(sample_rate * 0.035))
        fade_len = max(1, int(sample_rate * 0.004))
        rms_threshold = 0.002

        squared = mono.astype(np.float32) ** 2
        kernel = np.ones(window, dtype=np.float32) / float(window)
        rms = np.sqrt(np.convolve(squared, kernel, mode="same"))

        candidate = int(np.argmax(rms > rms_threshold)) if np.any(rms > rms_threshold) else 0
        trim_samples = candidate if 0 < candidate <= max_trim else 0

        processed = array[trim_samples:] if trim_samples > 0 else array

        if trim_samples > 0 and processed.shape[0] > 0:
            fade = np.linspace(0.0, 1.0, min(fade_len, processed.shape[0]), dtype=np.float32)
            if processed.ndim == 1:
                processed[: fade.shape[0]] *= fade
            else:
                processed[: fade.shape[0], ...] *= fade[:, None]
            return processed, {
                "leading_trim_samples": trim_samples,
                "fade_in_samples": int(fade.shape[0]),
            }

        return processed, {"leading_trim_samples": 0, "fade_in_samples": 0}

    def generate_custom_voice(
        self,
        text: str,
        language: str,
        speaker: str,
        instruct: str,
        model_id: str,
        output_name: str = "",
        seed: Optional[int] = None,
        non_streaming_mode: Optional[bool] = None,
        **generate_kwargs: Any,
    ) -> Tuple[Path, int, Dict[str, Any]]:
        """CustomVoice 모델 또는 시뮬레이션으로 음성을 생성한다.

        Args:
            text: 합성할 본문 텍스트.
            language: 합성 언어 설정.
            speaker: 사용할 기본 화자 이름.
            instruct: 스타일 제어용 추가 지시문.

        Returns:
            생성 오디오 경로, 샘플링 레이트, 실행 메타데이터.
        """

        output_path = self._generated_audio_path("tts-custom", f"{speaker} {text[:48]}", output_name)

        if self.simulation_mode or not self._qwen_available:
            sample_rate = self._fake_wave(text, output_path, f"custom:{speaker}:{instruct}")
            return output_path, sample_rate, {"simulation": True}

        self._apply_seed(seed)
        model = self._get_model("custom_voice", model_id)
        if non_streaming_mode is not None:
            generate_kwargs["non_streaming_mode"] = non_streaming_mode
        wavs, sample_rate = model.generate_custom_voice(
            text=text,
            language=language,
            speaker=speaker,
            instruct=instruct,
            **generate_kwargs,
        )
        processed, finalize = self._finalize_generated_wav(wavs[0], sample_rate)
        self._write_wav(processed, sample_rate, output_path)
        return output_path, sample_rate, {
            "simulation": False,
            "model_id": model_id,
            "seed": seed,
            "generation_kwargs": generate_kwargs,
            **finalize,
        }

    def generate_voice_design(
        self,
        text: str,
        language: str,
        instruct: str,
        model_id: str,
        output_name: str = "",
        seed: Optional[int] = None,
        non_streaming_mode: Optional[bool] = None,
        **generate_kwargs: Any,
    ) -> Tuple[Path, int, Dict[str, Any]]:
        """VoiceDesign 모델 또는 시뮬레이션으로 음성을 생성한다.

        Args:
            text: 합성할 본문 텍스트.
            language: 합성 언어 설정.
            instruct: 캐릭터 음성 설명문.

        Returns:
            생성 오디오 경로, 샘플링 레이트, 실행 메타데이터.
        """

        output_path = self._generated_audio_path("voice-design", text[:48] or instruct[:48], output_name)

        if self.simulation_mode or not self._qwen_available:
            sample_rate = self._fake_wave(text, output_path, f"design:{instruct}")
            return output_path, sample_rate, {"simulation": True}

        self._apply_seed(seed)
        model = self._get_model("voice_design", model_id)
        if non_streaming_mode is not None:
            generate_kwargs["non_streaming_mode"] = non_streaming_mode
        wavs, sample_rate = model.generate_voice_design(
            text=text,
            language=language,
            instruct=instruct,
            **generate_kwargs,
        )
        processed, finalize = self._finalize_generated_wav(wavs[0], sample_rate)
        self._write_wav(processed, sample_rate, output_path)
        return output_path, sample_rate, {
            "simulation": False,
            "model_id": model_id,
            "seed": seed,
            "generation_kwargs": generate_kwargs,
            **finalize,
        }

    def generate_voice_clone(
        self,
        text: str,
        language: str,
        model_id: str,
        ref_audio_path: str = "",
        ref_text: str = "",
        voice_clone_prompt_path: str = "",
        x_vector_only_mode: bool = False,
        output_name: str = "",
        seed: Optional[int] = None,
        non_streaming_mode: Optional[bool] = None,
        **generate_kwargs: Any,
    ) -> Tuple[Path, int, Dict[str, Any]]:
        """Base 모델 clone 경로 또는 시뮬레이션으로 음성을 생성한다.

        Args:
            text: 합성할 본문 텍스트.
            language: 합성 언어 설정.
            ref_audio_path: 참조 음성 파일 경로.
            ref_text: 참조 음성의 원문 텍스트.
            voice_clone_prompt_path: 미리 생성해 둔 clone prompt 경로.
            x_vector_only_mode: x-vector 전용 clone 모드 사용 여부.

        Returns:
            생성 오디오 경로, 샘플링 레이트, 실행 메타데이터.
        """

        output_path = self._generated_audio_path("voice-clone", text[:48], output_name)

        if self.simulation_mode or not self._qwen_available:
            seed_hint = voice_clone_prompt_path or ref_audio_path or ref_text
            sample_rate = self._fake_wave(text, output_path, f"clone:{seed_hint}:{x_vector_only_mode}")
            return output_path, sample_rate, {"simulation": True}

        self._apply_seed(seed)
        model = self._get_model("base_clone", model_id)
        if non_streaming_mode is not None:
            generate_kwargs["non_streaming_mode"] = non_streaming_mode

        # clone prompt가 있으면 가장 재현성이 높은 경로를 우선 사용하고,
        # 없을 때만 참조 음성/텍스트 기반 즉석 프롬프트 생성을 수행한다.
        if voice_clone_prompt_path:
            with (self.storage.repo_root / voice_clone_prompt_path).open("rb") as handle:
                prompt_payload = pickle.load(handle)
            wavs, sample_rate = model.generate_voice_clone(
                text=text,
                language=language,
                voice_clone_prompt=prompt_payload,
                **generate_kwargs,
            )
        else:
            resolved_ref_audio = ref_audio_path
            if ref_audio_path:
                ref_audio_candidate = Path(ref_audio_path)
                if not ref_audio_candidate.is_absolute():
                    resolved_ref_audio = str((self.storage.repo_root / ref_audio_candidate).resolve())
            wavs, sample_rate = model.generate_voice_clone(
                text=text,
                language=language,
                ref_audio=resolved_ref_audio,
                ref_text=ref_text,
                x_vector_only_mode=x_vector_only_mode,
                **generate_kwargs,
            )

        processed, finalize = self._finalize_generated_wav(wavs[0], sample_rate)
        self._write_wav(processed, sample_rate, output_path)
        return output_path, sample_rate, {
            "simulation": False,
            "model_id": model_id,
            "seed": seed,
            "generation_kwargs": generate_kwargs,
            **finalize,
        }

    def generate_hybrid_clone_instruct(
        self,
        text: str,
        language: str,
        instruct: str,
        base_model_id: str,
        custom_model_id: str,
        ref_audio_path: str,
        ref_text: str = "",
        x_vector_only_mode: bool = False,
        output_name: str = "",
        seed: Optional[int] = None,
        non_streaming_mode: Optional[bool] = None,
        **generate_kwargs: Any,
    ) -> Tuple[Path, int, Dict[str, Any]]:
        """Base clone prompt와 CustomVoice instruct를 함께 써서 음성을 생성한다.

        Args:
            text: 합성할 본문 텍스트.
            language: 합성 언어 설정.
            instruct: 스타일 제어용 추가 지시문.
            base_model_id: clone prompt를 만들 Base 모델 경로.
            custom_model_id: instruct 합성에 사용할 CustomVoice 모델 경로.
            ref_audio_path: 참조 음성 파일 경로.
            ref_text: 참조 음성의 원문 텍스트.
            x_vector_only_mode: x-vector 전용 clone 모드 사용 여부.

        Returns:
            생성 오디오 경로, 샘플링 레이트, 실행 메타데이터.
        """

        output_path = self._generated_audio_path("hybrid-clone-instruct", text[:48], output_name)

        if self.simulation_mode or not self._qwen_available:
            seed_hint = f"{base_model_id}:{custom_model_id}:{ref_audio_path}:{instruct}"
            sample_rate = self._fake_wave(text, output_path, f"hybrid:{seed_hint}")
            return output_path, sample_rate, {"simulation": True}

        self._apply_seed(seed)
        base_model = self._get_model("base_clone", base_model_id)
        custom_model = self._get_model("custom_voice", custom_model_id)

        prompt_items = base_model.create_voice_clone_prompt(
            ref_audio=str(self.storage.repo_root / ref_audio_path),
            ref_text=ref_text or None,
            x_vector_only_mode=x_vector_only_mode,
        )
        voice_clone_prompt = base_model._prompt_items_to_voice_clone_prompt(prompt_items)
        ref_ids = []
        for item in prompt_items:
            if item.ref_text:
                ref_ids.append(custom_model._tokenize_texts([custom_model._build_ref_text(item.ref_text)])[0])
            else:
                ref_ids.append(None)

        input_ids = custom_model._tokenize_texts([custom_model._build_assistant_text(text)])
        instruct_ids = []
        if instruct.strip():
            instruct_ids.append(custom_model._tokenize_texts([custom_model._build_instruct_text(instruct)])[0])
        else:
            instruct_ids.append(None)

        if non_streaming_mode is not None:
            generate_kwargs["non_streaming_mode"] = non_streaming_mode

        talker_codes_list, _ = custom_model.model.generate(
            input_ids=input_ids,
            instruct_ids=instruct_ids,
            ref_ids=ref_ids,
            voice_clone_prompt=voice_clone_prompt,
            languages=[language],
            speakers=[None],
            non_streaming_mode=generate_kwargs.pop("non_streaming_mode", False),
            **custom_model._merge_generate_kwargs(**generate_kwargs),
        )

        codes_for_decode = []
        ref_code_list = voice_clone_prompt.get("ref_code", None)
        for index, codes in enumerate(talker_codes_list):
            if ref_code_list is not None and ref_code_list[index] is not None:
                codes_for_decode.append(self._torch.cat([ref_code_list[index].to(codes.device), codes], dim=0))
            else:
                codes_for_decode.append(codes)

        wavs_all, sample_rate = custom_model.model.speech_tokenizer.decode(
            [{"audio_codes": codes} for codes in codes_for_decode]
        )

        wavs_out = []
        for index, wav in enumerate(wavs_all):
            if ref_code_list is not None and ref_code_list[index] is not None:
                ref_len = int(ref_code_list[index].shape[0])
                total_len = int(codes_for_decode[index].shape[0])
                cut = int(ref_len / max(total_len, 1) * wav.shape[0])
                wavs_out.append(wav[cut:])
            else:
                wavs_out.append(wav)

        processed, finalize = self._finalize_generated_wav(wavs_out[0], sample_rate)
        self._write_wav(processed, sample_rate, output_path)
        return output_path, sample_rate, {
            "simulation": False,
            "base_model_id": base_model_id,
            "custom_model_id": custom_model_id,
            "seed": seed,
            "generation_kwargs": generate_kwargs,
            **finalize,
            "path_kind": "hybrid_clone_instruct",
        }
