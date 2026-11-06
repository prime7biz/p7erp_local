/**
 * Employee photo: capture from an external / built-in webcam, the phone camera, or a file.
 * Photos are biometric data under the Personal Data Protection Act 2026, so the privacy notice
 * acknowledgement is required before upload (the backend refuses without it).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { hrBangladeshApi } from "@/api/hrBangladesh";
import { Banner, Card, Field, btnPrimary, btnSecondary, inputCls } from "@/components/hr/bd/BdUi";
import { useAction } from "@/components/hr/bd/bdHooks";
import { logApiError } from "@/utils/logApiError";

interface Props {
  employeeId: number;
  hasPhoto: boolean;
  onChanged: (hasPhoto: boolean) => void;
}

export function EmployeePhotoCapture({ employeeId, hasPhoto, onChanged }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const [captured, setCaptured] = useState<Blob | null>(null);
  const [capturedUrl, setCapturedUrl] = useState("");
  const [currentUrl, setCurrentUrl] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [lawfulBasis, setLawfulBasis] = useState("CONSENT");
  const { busy, error, notice, run, setError } = useAction();

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  useEffect(() => {
    if (!hasPhoto) {
      setCurrentUrl("");
      return;
    }
    let url = "";
    hrBangladeshApi
      .employeePhotoBlob(employeeId)
      .then((b) => {
        url = URL.createObjectURL(b);
        setCurrentUrl(url);
      })
      .catch((e) => logApiError("EmployeePhotoCapture.photo", e));
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [employeeId, hasPhoto]);

  useEffect(() => {
    return () => {
      if (capturedUrl) URL.revokeObjectURL(capturedUrl);
    };
  }, [capturedUrl]);

  const setCapturedBlob = (b: Blob | null) => {
    setCaptured(b);
    setCapturedUrl(b ? URL.createObjectURL(b) : "");
  };

  const startCamera = async (deviceId?: string) => {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser cannot open a camera. Use 'Take photo with phone' or upload a file.");
      return;
    }
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
      setCameras(devices);
      if (!deviceId && devices[0]) setCameraId(stream.getVideoTracks()[0]?.getSettings().deviceId ?? devices[0].deviceId);
    } catch (e) {
      logApiError("EmployeePhotoCapture.camera", e);
      setError("Camera could not start. Check the browser camera permission (HTTPS is required on the live site).");
    }
  };

  const snap = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    const size = Math.min(video.videoWidth, video.videoHeight);
    canvas.width = 600;
    canvas.height = 600;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, (video.videoWidth - size) / 2, (video.videoHeight - size) / 2, size, size, 0, 0, 600, 600);
    canvas.toBlob((b) => b && setCapturedBlob(b), "image/jpeg", 0.9);
    stopCamera();
  };

  const upload = () =>
    captured &&
    run(async () => {
      await hrBangladeshApi.uploadEmployeePhoto(employeeId, captured, lawfulBasis);
      setCapturedBlob(null);
      onChanged(true);
    }, "Photo saved. It will print on the ID card.");

  const remove = () => {
    if (!window.confirm("Delete this employee's photo? The consent record is closed as withdrawn.")) return;
    void run(async () => {
      await hrBangladeshApi.deleteEmployeePhoto(employeeId);
      onChanged(false);
    }, "Photo deleted.");
  };

  return (
    <Card
      title="Employee photo"
      description="Used on the ID card and for gate identification. A face photo is personal biometric data: show the employee the privacy notice first."
    >
      {error ? <Banner kind="error">{error}</Banner> : null}
      {notice ? <Banner kind="success">{notice}</Banner> : null}
      <div className="flex flex-wrap gap-6">
        <div className="space-y-2">
          <p className="text-xs font-medium text-text-secondary">Current photo</p>
          {currentUrl ? (
            <img src={currentUrl} alt="Current employee" className="h-36 w-36 rounded-lg border border-border object-cover" />
          ) : (
            <div className="flex h-36 w-36 items-center justify-center rounded-lg border border-dashed border-border text-xs text-text-muted">No photo</div>
          )}
          {hasPhoto ? (
            <button type="button" className={btnSecondary} onClick={remove} disabled={busy}>
              Delete photo
            </button>
          ) : null}
        </div>

        <div className="min-w-[260px] flex-1 space-y-3">
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnSecondary} onClick={() => void startCamera(cameraId || undefined)} disabled={busy}>
              {cameraOn ? "Restart camera" : "Open webcam"}
            </button>
            <label className={`${btnSecondary} cursor-pointer`}>
              Take photo with phone
              <input
                type="file"
                accept="image/*"
                capture="user"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setCapturedBlob(f);
                  e.target.value = "";
                }}
              />
            </label>
            <label className={`${btnSecondary} cursor-pointer`}>
              Upload file
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setCapturedBlob(f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>

          {cameras.length > 1 ? (
            <Field label="Camera" htmlFor="bd-photo-camera" hint="Choose the external USB webcam if one is connected.">
              <select
                id="bd-photo-camera"
                className={inputCls}
                value={cameraId}
                onChange={(e) => {
                  setCameraId(e.target.value);
                  void startCamera(e.target.value);
                }}
              >
                {cameras.map((c, i) => (
                  <option key={c.deviceId} value={c.deviceId}>
                    {c.label || `Camera ${i + 1}`}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}

          <div className={cameraOn ? "space-y-2" : "hidden"}>
            <video ref={videoRef} className="h-48 w-64 rounded-lg bg-black object-cover" muted playsInline />
            <div className="flex gap-2">
              <button type="button" className={btnPrimary} onClick={snap}>
                Capture
              </button>
              <button type="button" className={btnSecondary} onClick={stopCamera}>
                Close camera
              </button>
            </div>
          </div>

          {capturedUrl ? (
            <div className="space-y-3 rounded-lg border border-border p-3">
              <img src={capturedUrl} alt="New employee" className="h-36 w-36 rounded-lg object-cover" />
              <Field label="Lawful basis" htmlFor="bd-photo-basis">
                <select id="bd-photo-basis" className={inputCls} value={lawfulBasis} onChange={(e) => setLawfulBasis(e.target.value)}>
                  <option value="CONSENT">Employee consent</option>
                  <option value="EMPLOYMENT_LAW">Required for employment (ID card)</option>
                </select>
              </Field>
              <label className="flex items-start gap-2 text-sm text-text-secondary">
                <input type="checkbox" className="mt-1" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
                The employee has seen the privacy notice: the photo is kept only for the HR file, ID card and gate identification and is not shared outside the company.
              </label>
              <div className="flex gap-2">
                <button type="button" className={btnPrimary} disabled={!acknowledged || busy} onClick={() => void upload()}>
                  {busy ? "Saving..." : "Save photo"}
                </button>
                <button type="button" className={btnSecondary} onClick={() => setCapturedBlob(null)}>
                  Discard
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
