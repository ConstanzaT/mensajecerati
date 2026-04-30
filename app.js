      autoNavigateBeforeEnd();
    }
  });

  audio.addEventListener("loadedmetadata", () => {
    if (audio !== activeAudio) return;
    updateTimeline(0, getPreviewDuration(audio));
    scheduleAutoTransition();
  });

  audio.addEventListener("play", () => {
    if (audio !== activeAudio) return;
    els.visualizer.classList.add("is-playing");
    els.playIcon.innerHTML = pausePath;
    scheduleAutoTransition();
  });

  audio.addEventListener("pause", () => {
    if (audio !== activeAudio || shouldKeepPlaying) return;
    els.visualizer.classList.remove("is-playing");
    els.playIcon.innerHTML = playPath;
    clearAutoTransitionTimer();
  });

  audio.addEventListener("ended", async () => {
    if (audio !== activeAudio) return;
    if (autoTransitioning) return;

    shouldKeepPlaying = true;
    await autoNavigateBeforeEnd();
  });
}

els.play.addEventListener("click", () => {
  flashDiscGold();
  burstGoldSparks(els.play);
  if (activeAudio.paused) {
    playCurrent();
  } else {
    pauseCurrent();
  }
});

els.next.addEventListener("click", () => navigateWithEffects(els.next, "next"));
els.prev.addEventListener("click", () => navigateWithEffects(els.prev, "previous"));
els.rainToggle.addEventListener("click", () => toggleAmbientMode("rain", els.rainToggle));
els.waterToggle.addEventListener("click", () => toggleAmbientMode("water", els.waterToggle));
els.windToggle.addEventListener("click", () => toggleAmbientMode("wind", els.windToggle));
els.fireToggle.addEventListener("click", () => toggleAmbientMode("fire", els.fireToggle));

els.circularTimeline.addEventListener("click", () => {
  const duration = Math.min(activeAudio.duration || 30, 30);
  activeAudio.currentTime = Math.min(activeAudio.currentTime + 5, duration - 0.3);
});

els.progress.addEventListener("input", () => {
  activeAudio.currentTime = Number(els.progress.value);
  scheduleAutoTransition();
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && shouldKeepPlaying && activeAudio.paused) {
    playCurrent();
  }
});

window.addEventListener("focus", () => {
  if (shouldKeepPlaying && activeAudio.paused) {
    playCurrent();
  }
});

window.addEventListener("pageshow", () => {
  if (shouldKeepPlaying) {
    scheduleAutoTransition();
  }
});

if ("mediaSession" in navigator) {
  [
    ["previoustrack", () => previousNavigate()],
    ["nexttrack", () => nextNavigate()],
    ["play", () => playCurrent()],
    ["pause", () => pauseCurrent()],
  ].forEach(([action, handler]) => {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch (error) {
      // Some browsers expose Media Session partially.
    }
  });
}

els.copyLyric.addEventListener("click", async () => {
  const text = els.lyricLine.textContent.trim();
  flashDiscGold();
  burstGoldSparks(els.copyLyric);

  try {
    await navigator.clipboard.writeText(text);
    setStatus("Frase copiada", "ready");
  } catch (error) {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(els.lyricLine);
    selection.removeAllRanges();
    selection.addRange(range);
    setStatus("Frase seleccionada para copiar", "ready");
  }
});

attachAudioEvents(els.audio);
attachAudioEvents(els.audioB);
createRainDrops();
init();
