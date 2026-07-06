import { useState, useRef, useCallback } from 'react';

function getSupportedMimeType(): string {
  const possibleTypes = [
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9,opus',
    'video/webm',
    'video/mp4'
  ];
  for (const type of possibleTypes) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  throw new Error('No supported video MIME type found for MediaRecorder');
}

export function useChunkedRecorder(stream: MediaStream | null, roomId: string) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [uploadedParts, setUploadedParts] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const bufferRef = useRef<Blob[]>([]);
  const partNumberRef = useRef<number>(0);
  const activeUploadsRef = useRef<Promise<void>[]>([]);

  const uploadPart = async (blob: Blob, recId: string, mime: string) => {
    partNumberRef.current += 1;
    const currentPartNumber = partNumberRef.current;

    try {
      // 1. Get presigned URL
      const urlRes = await fetch('/api/recordings/part-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordingId: recId, partNumber: currentPartNumber }),
      });
      
      if (!urlRes.ok) throw new Error('Failed to get part URL');
      const { url } = await urlRes.json();

      // 2. Upload directly to S3
      const putRes = await fetch(url, {
        method: 'PUT',
        body: blob,
        headers: { 'Content-Type': mime },
      });

      if (!putRes.ok) throw new Error('Failed to upload part to S3');
      
      const etag = putRes.headers.get('ETag');
      if (!etag) throw new Error('No ETag returned from S3');

      // 3. Save ETag (sending both 'eTag' and 'etag' to be safe)
      const saveRes = await fetch('/api/recordings/save-etag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          recordingId: recId, 
          partNumber: currentPartNumber, 
          eTag: etag, 
          etag 
        }),
      });

      if (!saveRes.ok) throw new Error('Failed to save ETag');

      setUploadedParts((prev) => prev + 1);
    } catch (error) {
      console.error(`Error uploading part ${currentPartNumber}:`, error);
    }
  };

  const startRecording = useCallback(async () => {
    if (!stream) {
      console.warn("No stream provided to startRecording");
      return;
    }
    if (!roomId) {
      console.warn("No roomId provided to startRecording");
      return;
    }

    try {
      const mimeType = getSupportedMimeType();
      const filename = `recording-${Date.now()}.webm`;

      const initRes = await fetch('/api/recordings/init-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, filename }),
      });
      
      if (!initRes.ok) throw new Error('Failed to initialize upload');
      const { recordingId: newRecordingId } = await initRes.json();

      setRecordingId(newRecordingId);
      setUploadedParts(0);
      partNumberRef.current = 0;
      bufferRef.current = [];
      activeUploadsRef.current = [];

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          bufferRef.current.push(event.data);
          
          const totalSize = bufferRef.current.reduce((acc, blob) => acc + blob.size, 0);
          
          if (totalSize >= 5 * 1024 * 1024) { // 5MB
            const chunkBlob = new Blob(bufferRef.current, { type: mimeType });
            bufferRef.current = [];
            
            const uploadTask = uploadPart(chunkBlob, newRecordingId, mimeType);
            activeUploadsRef.current.push(uploadTask);
            
            uploadTask.finally(() => {
              // Remove the task from the array once it's done so we don't leak memory
              activeUploadsRef.current = activeUploadsRef.current.filter(t => t !== uploadTask);
            });
          }
        }
      };

      recorder.onstop = async () => {
        if (bufferRef.current.length > 0) {
          const finalBlob = new Blob(bufferRef.current, { type: mimeType });
          bufferRef.current = [];
          
          const uploadTask = uploadPart(finalBlob, newRecordingId, mimeType);
          activeUploadsRef.current.push(uploadTask);
          
          uploadTask.finally(() => {
            activeUploadsRef.current = activeUploadsRef.current.filter(t => t !== uploadTask);
          });
        }

        // Wait for all pending uploads to finish before setting isRecording to false
        await Promise.all(activeUploadsRef.current);
        
        setIsRecording(false);
      };

      recorder.start(5000); // 5000ms chunks
      setIsRecording(true);

    } catch (error) {
      console.error("Failed to start recording:", error);
    }
  }, [stream, roomId]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  return {
    startRecording,
    stopRecording,
    state: {
      isRecording,
      recordingId,
      uploadedParts,
    }
  };
}
