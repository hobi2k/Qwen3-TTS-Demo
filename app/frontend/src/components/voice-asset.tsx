"use client";

import { ChangeEvent, ReactNode, useRef, useState } from "react";
import { Camera, Download, Loader2, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";
import { mediaUrl } from "@/lib/app-ui";
import { useTranslation } from "@/lib/i18n";
import { VoiceAssetKind } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

interface VoiceAssetAvatarProps {
  kind: VoiceAssetKind;
  assetId: string;
  imageUrl?: string | null;
  fallback: ReactNode;
  alt?: string;
  onChange?: (nextUrl: string | null) => void;
}

export function VoiceAssetAvatar({
  kind,
  assetId,
  imageUrl,
  fallback,
  alt,
  onChange,
}: VoiceAssetAvatarProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const result = await api.uploadVoiceImage(kind, assetId, file);
      onChange?.(result.image_url);
      toast.success(t("voiceAsset.image.uploaded", "이미지를 등록했습니다."));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("voiceAsset.image.uploadFailed", "이미지 업로드 실패"));
    } finally {
      setBusy(false);
    }
  }

  async function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    if (!imageUrl) return;
    setBusy(true);
    try {
      await api.deleteVoiceImage(kind, assetId);
      onChange?.(null);
      toast.success(t("voiceAsset.image.removed", "이미지를 제거했습니다."));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("voiceAsset.image.removeFailed", "이미지 제거 실패"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="group relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-md border border-line bg-canvas">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={mediaUrl(imageUrl)}
          alt={alt ?? assetId}
          className="size-full object-cover"
        />
      ) : (
        <div className="grid size-full place-items-center text-ink-subtle">{fallback}</div>
      )}

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="absolute inset-0 grid place-items-center bg-overlay opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-100"
        aria-label={t("voiceAsset.image.upload", "이미지 업로드")}
        disabled={busy}
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin text-ink" />
        ) : (
          <Camera className="size-4 text-ink" />
        )}
      </button>

      {imageUrl && !busy ? (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-0 top-0 grid size-5 place-items-center rounded-bl-md bg-canvas/90 text-ink-muted opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 hover:text-danger"
          aria-label={t("voiceAsset.image.remove", "이미지 제거")}
        >
          <X className="size-3" />
        </button>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}

interface DeleteAssetButtonProps {
  kind: VoiceAssetKind | "trained";
  assetId: string;
  assetName: string;
  onDeleted: () => void;
  size?: "sm" | "default";
}

export function DeleteAssetButton({
  kind,
  assetId,
  assetName,
  onDeleted,
  size = "sm",
}: DeleteAssetButtonProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  async function performDelete() {
    setBusy(true);
    try {
      if (kind === "preset") await api.deletePreset(assetId);
      else if (kind === "s2pro") await api.deleteS2ProVoice(assetId);
      else if (kind === "rvc") await api.deleteVoiceChangerModel(assetId);
      else if (kind === "trained") await api.deleteFineTuneRun(assetId);
      toast.success(t("voiceAsset.delete.success", "삭제했습니다."));
      onDeleted();
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("voiceAsset.delete.failed", "삭제 실패"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size={size}
          className="text-ink-muted hover:bg-danger/10 hover:text-danger"
          aria-label={t("action.delete", "삭제")}
        >
          <Trash2 className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("voiceAsset.delete.title", "정말 삭제할까요?")}</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <span className="block">
              <strong className="text-ink">{assetName}</strong>
              {kind === "rvc"
                ? t("voiceAsset.delete.rvcWarning", " — 모델 .pth/.index 파일이 함께 삭제되며 되돌릴 수 없습니다.")
                : kind === "preset"
                  ? t("voiceAsset.delete.presetWarning", " — 프리셋 메타데이터가 삭제됩니다. 참조 음성 파일은 보존됩니다.")
                  : kind === "trained"
                    ? t("voiceAsset.delete.trainedWarning", " — 학습 결과 폴더와 실행 기록이 함께 삭제되며 되돌릴 수 없습니다.")
                    : t("voiceAsset.delete.s2proWarning", " — S2-Pro 보이스 메타데이터가 삭제됩니다.")}
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{t("action.cancel", "취소")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              void performDelete();
            }}
            disabled={busy}
            className="bg-danger text-ink-on-accent hover:bg-danger/90"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            <span className="ml-2">{t("action.delete", "삭제")}</span>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface DownloadAssetButtonProps {
  href: string;
  label?: string;
  size?: "sm" | "default";
}

export function DownloadAssetButton({
  href,
  label,
  size = "sm",
}: DownloadAssetButtonProps) {
  const { t } = useTranslation();
  const accessibleLabel = label || t("action.download", "다운로드");

  return (
    <Button asChild variant="outline" size={size} aria-label={accessibleLabel}>
      <a href={href} download>
        <Download className="size-4" />
        <span className="ml-2">{accessibleLabel}</span>
      </a>
    </Button>
  );
}
