import { useEffect, useState } from "react";
import { useLanguage } from "../lib/LanguageProvider";

/** Local preview only: no upload or permissions are requested by this component. */
export function UploadImageDetails({
  file,
  busy,
}: {
  file: File | null;
  busy: boolean;
}) {
  const { t } = useLanguage();
  const [preview, setPreview] = useState("");
  const [dimensions, setDimensions] = useState("");
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    setDimensions("");
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return (
    <div className="space-y-2 text-xs text-ink-muted" aria-live="polite">
      <p>
        {t(
          "JPEG، PNG، WebP • حتى 8MB • شعار 2000×2000 وغلاف 4000×2500",
          "JPEG, PNG, WebP • up to 8MB • logo 2000×2000, cover 4000×2500",
        )}
      </p>
      {file && preview && (
        <div className="flex items-center gap-3">
          <img
            src={preview}
            alt={t("معاينة الصورة المختارة", "Selected image preview")}
            className="size-16 rounded-lg object-contain"
            onLoad={(event) =>
              setDimensions(
                `${event.currentTarget.naturalWidth} × ${event.currentTarget.naturalHeight}`,
              )
            }
          />
          <span dir="ltr">
            {dimensions} · {(file.size / 1024 / 1024).toFixed(2)} MB
          </span>
        </div>
      )}
      {busy && (
        <>
          <progress
            className="w-full"
            aria-label={t(
              "جارٍ رفع الصورة ومعالجتها",
              "Uploading and processing image",
            )}
          />
          <p>{t("جارٍ رفع الصورة ومعالجتها…", "Uploading and processing…")}</p>
        </>
      )}
    </div>
  );
}
