import { useRef, useState } from "react";
import { supabase } from "../lib/supabase";

interface FileUploadProps {
  artistId: string;
  onUploaded: (url: string, fileName: string) => void;
}

export function FileUpload({ artistId, onUploaded }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const uploadFile = async (file: File) => {
    if (!file) return;
    setError(null);
    setUploading(true);
    setProgress(10);

    try {
      const ext = file.name.split(".").pop();
      const path = `artists/${artistId}/contracts/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

      setProgress(30);

      const { data, error: uploadError } = await supabase.storage
        .from("ria-documents")
        .upload(path, file, { cacheControl: "3600", upsert: false });

      if (uploadError) throw uploadError;

      setProgress(80);

      // Get a signed URL (valid 10 years for contracts)
      const { data: urlData } = await supabase.storage
        .from("ria-documents")
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);

      setProgress(100);
      onUploaded(urlData?.signedUrl ?? path, file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };

  return (
    <div className="space-y-2">
      <label className="mb-1 block text-xs font-medium text-slate-600">
        Upload Contract File
      </label>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !uploading && inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 transition ${
          dragOver ? "border-slate-500 bg-slate-50" : "border-slate-200 hover:border-slate-400 hover:bg-slate-50"
        } ${uploading ? "cursor-not-allowed opacity-60" : ""}`}>
        <input ref={inputRef} type="file" className="hidden"
          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
          onChange={handleFileChange} disabled={uploading} />
        {uploading ? (
          <div className="w-full space-y-2">
            <p className="text-center text-sm text-slate-600">Uploading…</p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-slate-900 transition-all duration-300"
                style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : (
          <>
            <svg className="mb-2 h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-sm font-medium text-slate-700">Drop file here or click to browse</p>
            <p className="mt-1 text-xs text-slate-400">PDF, Word, JPG, PNG — max 50MB</p>
          </>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
