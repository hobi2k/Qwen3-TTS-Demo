"""Compatibility helpers for optional video I/O backends.

MMAudio's training path can run from pre-extracted feature datasets, but some
evaluation and extraction helpers still rely on TorchAudio's legacy ``torio``
streaming API. TorchAudio 2.11 CUDA 13 wheels no longer expose that module, so
we import it lazily and fail only when a video reader/writer is actually used.
"""


def get_streaming_media_decoder():
    """Return TorchAudio's legacy streaming decoder or raise an actionable error."""

    try:
        from torio.io import StreamingMediaDecoder
    except ModuleNotFoundError as error:
        raise RuntimeError(
            "MMAudio video decoding needs TorchAudio's legacy torio backend. "
            "The current torch/torchaudio cu130 environment does not ship torio. "
            "Use pre-extracted MMAudio datasets for training, or install a "
            "torio-compatible torch/torchaudio build before running raw video "
            "evaluation/extraction utilities."
        ) from error
    return StreamingMediaDecoder


def get_streaming_media_encoder():
    """Return TorchAudio's legacy streaming encoder or raise an actionable error."""

    try:
        from torio.io import StreamingMediaEncoder
    except ModuleNotFoundError as error:
        raise RuntimeError(
            "MMAudio video encoding needs TorchAudio's legacy torio backend. "
            "The current torch/torchaudio cu130 environment does not ship torio. "
            "Audio-only generation and pre-extracted training remain available."
        ) from error
    return StreamingMediaEncoder
