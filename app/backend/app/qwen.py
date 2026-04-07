import math
import os
import random
import struct
import wave
from pathlib import Path
from typing import Any, Dict, List, Tuple

from .storage import Storage

try:
    import soundfile as sf  # type: ignore
except Exception:  # pragma: no cover
    sf = None


class QwenDemoEngine:
    def __init__(self, storage: Storage):
        self.storage = storage
        self.simulation_mode = os.getenv("QWEN_DEMO_SIMULATION", "1").lower() not in {"0", "false", "no"}
        self._qwen_available = False
        self._torch = None
        self._Qwen3TTSModel = None
        self._models: Dict[str, Any] = {}
        self._bootstrap()

    @property
    def qwen_tts_available(self) -> bool:
        return self._qwen_available

    def _bootstrap(self) -> None:
        try:
            import torch  # type: ignore
            from qwen_tts import Qwen3TTSModel  # type: ignore

            self._torch = torch
            self._Qwen3TTSModel = Qwen3TTSModel
            self._qwen_available = True
        except Exception:
            self._qwen_available = False

    def _get_model(self, key: str, model_id: str):
        if key in self._models:
            return self._models[key]

        if not self._qwen_available or self.simulation_mode:
            return None

        dtype = getattr(self._torch, "bfloat16", None)
        model = self._Qwen3TTSModel.from_pretrained(
            model_id,
            device_map=os.getenv("QWEN_DEMO_DEVICE", "cuda:0"),
            dtype=dtype,
            attn_implementation=os.getenv("QWEN_DEMO_ATTN_IMPL", "flash_attention_2"),
        )
        self._models[key] = model
        return model

    def supported_speakers(self) -> List[Dict[str, str]]:
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

    def _fake_wave(self, text: str, destination: Path, variant: str) -> int:
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

            for index in range(frame_count):
                t = index / sample_rate
                envelope = min(1.0, index / 2500.0) * min(1.0, (frame_count - index) / 2500.0)
                wobble = 0.2 * math.sin(2 * math.pi * 2.0 * t)
                sample = amplitude * envelope * math.sin(2 * math.pi * (base_frequency + wobble * 25) * t)
                pcm = max(-32767, min(32767, int(sample * 32767)))
                handle.writeframes(struct.pack("<h", pcm))

        return sample_rate

    def _write_wav(self, wav: Any, sample_rate: int, destination: Path) -> None:
        if sf is not None:
            sf.write(str(destination), wav, sample_rate)
            return

        self._fake_wave("fallback", destination, "fallback")

    def generate_custom_voice(self, text: str, language: str, speaker: str, instruct: str) -> Tuple[Path, int, Dict[str, Any]]:
        output_path = self.storage.generated_dir / f"{self.storage.new_id('audio')}.wav"

        if self.simulation_mode or not self._qwen_available:
            sample_rate = self._fake_wave(text, output_path, f"custom:{speaker}:{instruct}")
            return output_path, sample_rate, {"simulation": True}

        model = self._get_model("custom_voice", os.getenv("QWEN_DEMO_CUSTOM_MODEL", "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice"))
        wavs, sample_rate = model.generate_custom_voice(
            text=text,
            language=language,
            speaker=speaker,
            instruct=instruct,
        )
        self._write_wav(wavs[0], sample_rate, output_path)
        return output_path, sample_rate, {"simulation": False}

    def generate_voice_design(self, text: str, language: str, instruct: str) -> Tuple[Path, int, Dict[str, Any]]:
        output_path = self.storage.generated_dir / f"{self.storage.new_id('audio')}.wav"

        if self.simulation_mode or not self._qwen_available:
            sample_rate = self._fake_wave(text, output_path, f"design:{instruct}")
            return output_path, sample_rate, {"simulation": True}

        model = self._get_model("voice_design", os.getenv("QWEN_DEMO_DESIGN_MODEL", "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign"))
        wavs, sample_rate = model.generate_voice_design(
            text=text,
            language=language,
            instruct=instruct,
        )
        self._write_wav(wavs[0], sample_rate, output_path)
        return output_path, sample_rate, {"simulation": False}

    def generate_voice_clone(
        self,
        text: str,
        language: str,
        ref_audio_path: str = "",
        ref_text: str = "",
        voice_clone_prompt_path: str = "",
        x_vector_only_mode: bool = False,
    ) -> Tuple[Path, int, Dict[str, Any]]:
        output_path = self.storage.generated_dir / f"{self.storage.new_id('audio')}.wav"

        if self.simulation_mode or not self._qwen_available:
            seed_hint = voice_clone_prompt_path or ref_audio_path or ref_text
            sample_rate = self._fake_wave(text, output_path, f"clone:{seed_hint}:{x_vector_only_mode}")
            return output_path, sample_rate, {"simulation": True}

        model = self._get_model("base_clone", os.getenv("QWEN_DEMO_BASE_MODEL", "Qwen/Qwen3-TTS-12Hz-1.7B-Base"))

        if voice_clone_prompt_path:
            with (self.storage.repo_root / voice_clone_prompt_path).open("rb") as handle:
                prompt_payload = pickle.load(handle)
            wavs, sample_rate = model.generate_voice_clone(
                text=text,
                language=language,
                voice_clone_prompt=prompt_payload,
            )
        else:
            wavs, sample_rate = model.generate_voice_clone(
                text=text,
                language=language,
                ref_audio=ref_audio_path,
                ref_text=ref_text,
                x_vector_only_mode=x_vector_only_mode,
            )

        self._write_wav(wavs[0], sample_rate, output_path)
        return output_path, sample_rate, {"simulation": False}
