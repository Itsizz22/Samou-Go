import { useState } from "react";
import { getPrescriptionImage } from "./api";
export function PrescriptionImage({
  id,
  audience,
}: {
  id: string;
  audience: "customer" | "store";
}) {
  const [image, setImage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="my-3">
      <button
        type="button"
        disabled={busy}
        className="min-h-11 rounded-xl border border-brand px-4 text-sm font-bold text-brand"
        onClick={async () => {
          if (image) {
            setImage("");
            return;
          }
          setBusy(true);
          setError("");
          try {
            setImage((await getPrescriptionImage(id, audience)).image);
          } catch {
            setError("تعذر تحميل الصورة. أعد المحاولة.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy
          ? "جارٍ تحميل الوصفة…"
          : image
            ? "إخفاء الوصفة"
            : "عرض صورة الوصفة"}
      </button>
      {error && <p role="alert">{error}</p>}
      {image && (
        <img
          src={image}
          alt="الوصفة الطبية المرفقة"
          className="mt-3 max-h-screen w-full rounded-xl object-contain"
        />
      )}
    </div>
  );
}
