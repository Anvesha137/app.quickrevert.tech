import React, { useRef, useState } from 'react';
import { Upload, Loader2, Image as ImageIcon, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { registerPendingUpload } from '../../lib/pendingUploads';
import { useTheme } from '../../contexts/ThemeContext';
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface MediaUploadProps {
  onUploadSuccess: (url: string) => void;
  className?: string;
  label?: string;
  readOnly?: boolean;
}

export const MediaUpload: React.FC<MediaUploadProps> = ({
  onUploadSuccess,
  className,
  label = "Upload Image",
  readOnly = false
}) => {
  const { darkMode } = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check if it's an image
    if (!file.type.startsWith('image/')) {
      toast.error("Please upload an image file (PNG, JPG, etc)");
      return;
    }

    try {
      setUploading(true);
      setUploaded(false);

      // Immediate readability check - ensures the browser can actually read the bits
      await new Promise((resolve, reject) => {
        const checkReader = new FileReader();
        checkReader.onload = () => resolve(true);
        checkReader.onerror = () => reject(new Error("This file cannot be read by the browser. It might be locked or restricted."));
        // Just read the first 100 bytes to verify access
        checkReader.readAsArrayBuffer(file.slice(0, 100));
      });

      // Register the file locally instead of uploading it to Supabase immediately
      const blobUrl = registerPendingUpload(file);

      onUploadSuccess(blobUrl);
      setUploaded(true);
      toast.success("Image selected and ready for saving!");
    } catch (error: any) {
      console.error("Selection failed:", error);
      toast.error(error.message || "Failed to process image. Please try again.");
    } finally {
      setUploading(false);
      // Reset input so the same file can be selected again
      if (fileInputRef.current) fileInputRef.current.value = '';
    }

  };

  const triggerUpload = () => {
    if (readOnly || uploading) return;
    fileInputRef.current?.click();
  };

  return (
    <div className={cn("relative", className)}>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept="image/*"
        disabled={readOnly || uploading}
      />

      <button
        type="button"
        onClick={triggerUpload}
        disabled={readOnly || uploading}
        className={cn(
          "w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all border-2",
          uploading
            ? (darkMode ? "bg-white/5 border-white/10 text-white/50 cursor-wait" : "bg-gray-50 border-gray-100 text-gray-400 cursor-wait")
            : uploaded
              ? (darkMode ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-emerald-50 border-emerald-100 text-emerald-600")
              : (darkMode
                ? "bg-white/5 border-white/10 text-white hover:bg-white/10 hover:border-purple-500/50"
                : "bg-white border-gray-200 text-gray-700 hover:border-purple-500 hover:bg-purple-50/30")
        )}
      >
        {uploading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Optimizing...
          </>
        ) : uploaded ? (
          <>
            <CheckCircle2 className="w-4 h-4" />
            Ready
          </>
        ) : (
          <>
            <Upload className="w-4 h-4" />
            {label}
          </>
        )}
      </button>

      {/* 100KB Note */}
      <div className="flex items-center gap-1 mt-1.5 px-2">
        <ImageIcon className={cn("w-3 h-3", darkMode ? "text-white/20" : "text-gray-400")} />
        {/* <span className={cn("text-[9px] font-bold uppercase tracking-widest", darkMode ? "text-white/20" : "text-gray-400")}>Max 100KB (Auto-optimized)</span> */}
      </div>
    </div>
  );
};
