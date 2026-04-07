import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, Sparkles, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { getSupabaseClient } from '../../lib/supabaseClient';
import Button from './Button';

async function compressImage(file, maxDimension = 1600, quality = 0.82) {
  const imageUrl = URL.createObjectURL(file);

  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = imageUrl;
    await image.decode();

    const largestSide = Math.max(image.width, image.height);
    const scale = largestSide > maxDimension ? maxDimension / largestSide : 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));

    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image processing is not supported in this browser');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    return {
      dataUrl,
      mimeType: 'image/jpeg',
      width: canvas.width,
      height: canvas.height,
    };
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

export default function MenuAiScanner({
  restaurantName,
  onScanComplete,
  onBusyChange,
}) {
  const fileInputRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl('');
      return undefined;
    }

    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [selectedFile]);

  useEffect(() => {
    onBusyChange?.(isScanning);
  }, [isScanning, onBusyChange]);

  const handlePickFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please upload a JPG or PNG menu photo.');
      toast.error('Please upload a JPG or PNG menu photo');
      return;
    }
    setError('');
    setSelectedFile(file);
  };

  const handleScan = async () => {
    if (!selectedFile) {
      setError('Choose a menu photo first.');
      return;
    }

    setIsScanning(true);
    setError('');

    try {
      const supabase = getSupabaseClient();
      const compressed = await compressImage(selectedFile);

      const { data, error: invokeError } = await supabase.functions.invoke('process-menu-image', {
        body: {
          image: compressed.dataUrl,
          mimeType: compressed.mimeType,
          fileName: selectedFile.name,
          restaurantName: restaurantName || '',
        },
      });

      if (invokeError) throw invokeError;
      if (!data?.categories?.length) {
        throw new Error('No menu items were detected in this photo');
      }

      onScanComplete?.(data);
      setSelectedFile(null);
    } catch (scanError) {
      const message = scanError?.message || 'Unable to scan menu photo';
      setError(message);
      toast.error(message);
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="rounded-2xl border border-dashed border-[#FF6B35]/30 bg-orange-50/40 p-4 md:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-xl">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-orange-100 text-[#FF6B35] text-xs font-bold shadow-sm">
            <Sparkles size={14} />
            AI Magic
          </div>
          <h3 className="text-lg font-bold text-[#1A1A2E] mt-3">Upload Menu Photo (AI Magic)</h3>
          <p className="text-sm text-gray-600 mt-1">
            Scan a printed or handwritten menu image and let Gemini draft your categories and items.
          </p>
          <p className="text-xs text-gray-400 mt-2">The menu will still be shown for review before it is added.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handlePickFile(e.target.files?.[0])}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            icon={<ImagePlus size={14} />}
          >
            Choose Photo
          </Button>
          <Button
            type="button"
            variant="primary"
            loading={isScanning}
            disabled={!selectedFile}
            onClick={handleScan}
            icon={<Upload size={14} />}
          >
            Scan Menu
          </Button>
        </div>
      </div>

      {previewUrl ? (
        <div className="mt-4 grid gap-3 md:grid-cols-[160px_1fr] items-start">
          <img
            src={previewUrl}
            alt="Menu preview"
            className="w-full max-w-[160px] aspect-[3/4] object-cover rounded-2xl border border-white shadow-sm bg-white"
          />
          <div className="rounded-2xl bg-white border border-orange-100 p-4">
            <p className="text-sm font-semibold text-[#1A1A2E]">Ready to scan</p>
            <p className="text-xs text-gray-500 mt-1 break-all">{selectedFile?.name}</p>
            <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
              {isScanning ? (
                <>
                  <Loader2 size={14} className="animate-spin text-[#FF6B35]" />
                  <span className="animate-pulse text-[#FF6B35] font-semibold">Magic is happening…</span>
                </>
              ) : (
                <span>Image is compressed before upload to keep scanning fast on mobile.</span>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
          {error}
        </p>
      ) : null}
    </div>
  );
}
