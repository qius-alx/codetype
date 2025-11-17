document.addEventListener('DOMContentLoaded', () => {
    const outputEl = document.getElementById('output');
    const recordBtn = document.getElementById('record-btn');
    const statusEl = document.getElementById('status');
    const animationContainer = document.getElementById('animation-container');

    const textToAnimate = "Hello, world! This is a proof of concept.\n\nIf you can download this animation as an MP4 file, the core functionality is working correctly.";
    let animationInterval;
    let charIndex = 0;

    let mediaRecorder;
    let recordedChunks = [];
    let ffmpeg;

    /**
     * Updates the status message displayed to the user.
     */
    function setStatus(message) {
        console.log(message);
        statusEl.textContent = `Status: ${message}`;
    }

    /**
     * Types the text character by character into the output element.
     */
    function typeAnimation() {
        if (charIndex < textToAnimate.length) {
            outputEl.textContent += textToAnimate[charIndex];
            charIndex++;
        } else {
            clearInterval(animationInterval);
            // Wait a moment before stopping the recording to ensure the last frame is captured
            setTimeout(() => {
                if (mediaRecorder && mediaRecorder.state === "recording") {
                    mediaRecorder.stop();
                }
            }, 500);
        }
    }

    /**
     * Downloads a file from a Blob.
     */
    function downloadFile(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(url);
        document.body.removeChild(a);
    }

    /**
     * Transcodes a WebM blob to MP4 using ffmpeg.wasm.
     */
    async function transcodeToMp4(webmBlob) {
        setStatus('Loading ffmpeg-core.js');
        if (!ffmpeg) {
            ffmpeg = new FFmpeg.FFmpeg();
            ffmpeg.on('log', ({ message }) => {
                 // You can enable this for detailed FFMpeg logs
                 // console.log(message);
            });
            await ffmpeg.load({
                coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js'
            });
        }

        setStatus('Transcoding to MP4...');
        const inFilename = 'input.webm';
        const outFilename = 'output.mp4';

        await ffmpeg.writeFile(inFilename, await FFmpeg.fetchFile(webmBlob));
        // Simple transcode command: -i input -c:v video_codec output
        await ffmpeg.exec(['-i', inFilename, '-c:v', 'libx264', outFilename]);

        const data = await ffmpeg.readFile(outFilename);

        const mp4Blob = new Blob([data.buffer], { type: 'video/mp4' });
        downloadFile(mp4Blob, `poc-animation-${Date.now()}.mp4`);

        setStatus('MP4 download initiated!');
        recordBtn.disabled = false;
    }

    /**
     * Starts the recording process.
     */
    async function startRecording() {
        // Reset state
        recordBtn.disabled = true;
        outputEl.textContent = '';
        charIndex = 0;
        recordedChunks = [];
        setStatus('Preparing to record...');

        // Create a canvas to draw the animation frames on
        const canvas = document.createElement('canvas');
        canvas.width = animationContainer.clientWidth;
        canvas.height = animationContainer.clientHeight;
        const ctx = canvas.getContext('2d');

        // Capture a stream from the canvas
        const stream = canvas.captureStream(30); // 30 FPS for PoC

        // Setup MediaRecorder
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = async () => {
            setStatus('Recording finished. Preparing for transcoding.');
            // Stop the drawing loop
            cancelAnimationFrame(drawFrame.animationFrameId);
            const webmBlob = new Blob(recordedChunks, { type: 'video/webm' });

            try {
                await transcodeToMp4(webmBlob);
            } catch (error) {
                console.error('Transcoding failed:', error);
                setStatus('Transcoding failed! Downloading raw WebM file.');
                downloadFile(webmBlob, `poc-animation-fallback-${Date.now()}.webm`);
                recordBtn.disabled = false;
            }
        };

        // Start the drawing loop
        const drawFrame = async () => {
            if (mediaRecorder.state !== 'recording') return;
            try {
                const animCanvas = await html2canvas(animationContainer, { logging: false });
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(animCanvas, 0, 0, canvas.width, canvas.height);
            } catch (err) {
                console.error("html2canvas error:", err);
            }
            drawFrame.animationFrameId = requestAnimationFrame(drawFrame);
        };
        drawFrame.animationFrameId = requestAnimationFrame(drawFrame);

        // Start recording and the animation
        mediaRecorder.start();
        setStatus('Recording...');
        animationInterval = setInterval(typeAnimation, 100); // Type at 100ms per character
    }

    recordBtn.addEventListener('click', startRecording);
});
