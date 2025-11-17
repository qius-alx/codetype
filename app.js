document.addEventListener('DOMContentLoaded', () => {
    const codeInput = document.getElementById('code-input');
    const codeOutput = document.getElementById('code-output');
    const lineNumbersInput = document.querySelector('.line-numbers-input');
    const lineNumbersOutput = document.querySelector('.line-numbers-output');
    const playBtn = document.getElementById('play-btn');
    const pauseBtn = document.getElementById('pause-btn');
    const resetBtn = document.getElementById('reset-btn');
    const recordBtn = document.getElementById('record-btn');
    const downloadTxtBtn = document.getElementById('download-txt-btn');
    const speedSlider = document.getElementById('speed-slider');
    const speedValue = document.getElementById('speed-value');
    const languageSelector = document.getElementById('language-selector');
    const charCount = document.getElementById('char-count');
    const lineCount = document.getElementById('line-count');
    const statusText = document.getElementById('status-text');
    const outputPanel = document.querySelector('.output-panel');
    const cursor = document.querySelector('.cursor');

    let animationInterval;
    let charIndex = 0;
    let isPaused = false;
    let mediaRecorder;
    let recordedChunks = [];
    let ffmpeg;

    const initialCode = `function calculateFibonacci(n) {
    if (n <= 1) {
        return n;
    }
    return calculateFibonacci(n - 1) + calculateFibonacci(n - 2);
}

console.log(calculateFibonacci(10));`;
    codeInput.value = initialCode;
    updateLineNumbers();
    updateStatusBar();

    function updateLineNumbers() {
        const lines = codeInput.value.split('\n');
        lineNumbersInput.innerHTML = Array.from({ length: lines.length }, (_, i) => `<span>${i + 1}</span>`).join('');
    }

    function updateStatusBar() {
        const lines = codeInput.value.split('\n');
        charCount.textContent = `Chars: ${codeInput.value.length}`;
        lineCount.textContent = `Lines: ${lines.length}`;
    }

    function typeCode() {
        if (isPaused) return;

        const code = codeInput.value;
        if (charIndex < code.length) {
            codeOutput.textContent = code.substring(0, charIndex + 1);

            if (charIndex % 5 === 0 || code[charIndex] === '\n' || charIndex === code.length - 1) {
                Prism.highlightElement(codeOutput);
            }

            charIndex++;
            updateLineNumbersForOutput();
            outputPanel.scrollTop = outputPanel.scrollHeight;
        } else {
            clearInterval(animationInterval);
            Prism.highlightElement(codeOutput);
            statusText.textContent = 'Finished';
            cursor.classList.remove('active');
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                stopRecording();
            }
        }
    }

    function updateLineNumbersForOutput() {
        const lines = codeOutput.textContent.split('\n');
        lineNumbersOutput.innerHTML = Array.from({ length: lines.length }, (_, i) => `<span>${i + 1}</span>`).join('');
    }

    playBtn.addEventListener('click', () => {
        if (codeInput.value.trim() === '') {
            alert('Please enter some code to animate.');
            return;
        }
        isPaused = false;
        statusText.textContent = 'Playing';
        cursor.classList.add('active');
        clearInterval(animationInterval);
        animationInterval = setInterval(typeCode, speedSlider.value);
    });

    pauseBtn.addEventListener('click', () => {
        isPaused = true;
        statusText.textContent = 'Paused';
        cursor.classList.remove('active');
        clearInterval(animationInterval);
    });

    resetBtn.addEventListener('click', () => {
        clearInterval(animationInterval);
        charIndex = 0;
        isPaused = false;
        codeOutput.textContent = '';
        statusText.textContent = 'Ready';
        cursor.classList.remove('active');
        updateLineNumbersForOutput();
    });

    speedSlider.addEventListener('input', () => {
        speedValue.textContent = speedSlider.value;
        if (!isPaused && animationInterval) {
            clearInterval(animationInterval);
            animationInterval = setInterval(typeCode, speedSlider.value);
        }
    });

    languageSelector.addEventListener('change', () => {
        codeOutput.className = `language-${languageSelector.value}`;
        if (charIndex > 0) {
            if (confirm('Changing the language will reset the animation. Continue?')) {
                resetBtn.click();
            }
        }
    });

    codeInput.addEventListener('input', () => {
        updateLineNumbers();
        updateStatusBar();
        if (animationInterval) {
            isPaused = true;
            statusText.textContent = 'Paused (code edited)';
            cursor.classList.remove('active');
            clearInterval(animationInterval);
        }
    });

    async function startRecording() {
        resetBtn.click();
        statusText.textContent = '🔴 Recording...';
        recordBtn.textContent = '⏹ Stop Recording';
        recordBtn.classList.add('recording');
        playBtn.disabled = true;
        pauseBtn.disabled = true;

        const stream = await captureStream();
        if (!stream) {
            // Handle error
            return;
        }

        const mimeType = 'video/webm;codecs=vp9';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
            alert('WebM recording not supported in this browser.');
            // Implement fallback or show clearer error
            return;
        }

        mediaRecorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8000000 });
        recordedChunks = [];

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = async () => {
            statusText.textContent = 'Transcoding...';
            const webmBlob = new Blob(recordedChunks, { type: 'video/webm' });
            transcodeToMp4(webmBlob);
        };

        mediaRecorder.start();
        playBtn.click();
    }

    async function captureStream() {
        // Simple stream from canvas for now
        const canvas = document.createElement('canvas');
        canvas.width = outputPanel.clientWidth;
        canvas.height = outputPanel.clientHeight;
        const ctx = canvas.getContext('2d');

        const stream = canvas.captureStream(60); // 60 FPS

        const drawFrame = async () => {
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                try {
                    const outputCanvas = await html2canvas(outputPanel, {
                        logging: false,
                        useCORS: true,
                        backgroundColor: '#1e1e1e'
                    });
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(outputCanvas, 0, 0, canvas.width, canvas.height);
                } catch (error) {
                    console.error("html2canvas error:", error);
                }
                requestAnimationFrame(drawFrame);
            }
        };
        requestAnimationFrame(drawFrame);
        return stream;
    }


    function stopRecording() {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
        }
        recordBtn.textContent = 'Record Video';
        recordBtn.classList.remove('recording');
        playBtn.disabled = false;
        pauseBtn.disabled = false;
    }

    async function transcodeToMp4(webmBlob) {
        if (!ffmpeg) {
            try {
                ffmpeg = new FFmpeg.FFmpeg();
                ffmpeg.on('log', ({ message }) => console.log(message)); // For debugging
                await ffmpeg.load({
                    coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js'
                });
            } catch (error) {
                console.error("Failed to load ffmpeg.wasm:", error);
                statusText.textContent = "Error loading ffmpeg!";
                downloadFile(webmBlob, `code-animation-${Date.now()}.webm`);
                return;
            }
        }

        statusText.textContent = 'Transcoding to MP4...';
        try {
            const inFilename = 'input.webm';
            const outFilename = 'output.mp4';

            await ffmpeg.writeFile(inFilename, await FFmpeg.fetchFile(webmBlob));
            await ffmpeg.exec(['-i', inFilename, '-c:v', 'libx24', '-preset', 'ultrafast', '-crf', '22', outFilename]);

            const data = await ffmpeg.readFile(outFilename);
            const mp4Blob = new Blob([data.buffer], { type: 'video/mp4' });
            downloadFile(mp4Blob, `code-animation-${Date.now()}.mp4`);
            statusText.textContent = 'MP4 Ready!';

        } catch (error) {
            console.error("Transcoding failed:", error);
            statusText.textContent = "Transcoding failed. Downloading WebM.";
            downloadFile(webmBlob, `code-animation-${Date.now()}.webm`);
        }
    }

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

    recordBtn.addEventListener('click', () => {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            stopRecording();
        } else {
            startRecording();
        }
    });

    downloadTxtBtn.addEventListener('click', () => {
        const blob = new Blob([codeInput.value], { type: 'text/plain' });
        downloadFile(blob, 'code.txt');
    });

    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space') {
            e.preventDefault();
            if (isPaused) {
                playBtn.click();
            } else {
                pauseBtn.click();
            }
        } else if (e.code === 'KeyR') {
            resetBtn.click();
        } else if (e.code === 'Escape' && mediaRecorder && mediaRecorder.state === 'recording') {
            stopRecording();
        }
    });

    // Load FFmpeg via CDN
    const ffmpegScript = document.createElement('script');
    ffmpegScript.src = 'https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/umd/ffmpeg.min.js';
    ffmpegScript.onload = () => {
        console.log('ffmpeg.wasm script loaded.');
    };
    ffmpegScript.onerror = () => {
        console.error('Failed to load ffmpeg.wasm script.');
        statusText.textContent = 'Could not load FFMpeg.';
    };
    document.head.appendChild(ffmpegScript);
});
