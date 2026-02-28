// Карусель видео для индивидуальных звонков
(() => {
  let currentVideoIndex = 0;
  let videoElements = [];
  let isCarouselMode = false;

  function initCarousel() {
    const prevBtn = document.getElementById('prevVideo');
    const nextBtn = document.getElementById('nextVideo');
    
    if (prevBtn) prevBtn.addEventListener('click', showPrevVideo);
    if (nextBtn) nextBtn.addEventListener('click', showNextVideo);
    
    setInterval(updateCarousel, 300);
  }

  function shouldUseCarousel() {
    const videoGrid = document.querySelector('.video-grid');
    if (!videoGrid) return false;
    const containers = videoGrid.querySelectorAll('.video-container');
    return containers.length === 2;
  }

  function updateCarousel() {
    const videoGrid = document.querySelector('.video-grid');
    if (!videoGrid) return;

    const useCarousel = shouldUseCarousel();
    
    if (useCarousel && !isCarouselMode) {
      enableCarouselMode();
    } else if (!useCarousel && isCarouselMode) {
      disableCarouselMode();
    }

    if (isCarouselMode) {
      updateCarouselDisplay();
    }
  }

  function enableCarouselMode() {
    isCarouselMode = true;
    const videoGrid = document.querySelector('.video-grid');
    if (!videoGrid) return;

    videoGrid.classList.add('carousel-mode');
    videoGrid.style.display = 'flex';
    videoGrid.style.alignItems = 'center';
    videoGrid.style.justifyContent = 'center';
    videoGrid.style.position = 'relative';
    
    const prevBtn = document.getElementById('prevVideo');
    const nextBtn = document.getElementById('nextVideo');
    if (prevBtn) prevBtn.style.display = 'flex';
    if (nextBtn) nextBtn.style.display = 'flex';

    updateVideoElements();
    showVideo(currentVideoIndex);
  }

  function disableCarouselMode() {
    isCarouselMode = false;
    const videoGrid = document.querySelector('.video-grid');
    if (!videoGrid) return;

    videoGrid.classList.remove('carousel-mode');
    videoGrid.style.display = '';
    videoGrid.style.alignItems = '';
    videoGrid.style.justifyContent = '';
    videoGrid.style.position = '';
    
    const prevBtn = document.getElementById('prevVideo');
    const nextBtn = document.getElementById('nextVideo');
    if (prevBtn) prevBtn.style.display = 'none';
    if (nextBtn) nextBtn.style.display = 'none';

    const containers = videoGrid.querySelectorAll('.video-container');
    containers.forEach(container => {
      container.style.display = '';
      container.style.width = '';
      container.style.maxWidth = '';
      container.style.height = '';
      container.style.maxHeight = '';
      container.classList.remove('carousel-active');
    });
  }

  function updateVideoElements() {
    const videoGrid = document.querySelector('.video-grid');
    if (!videoGrid) return;
    videoElements = Array.from(videoGrid.querySelectorAll('.video-container'));
    if (currentVideoIndex >= videoElements.length) currentVideoIndex = 0;
  }

  function updateCarouselDisplay() {
    updateVideoElements();
    if (videoElements.length === 0) return;

    videoElements.forEach((el, index) => {
      if (index === currentVideoIndex) {
        el.style.display = 'block';
        el.style.width = '100%';
        el.style.maxWidth = '800px';
        el.style.height = 'auto';
        el.style.maxHeight = '600px';
        el.style.aspectRatio = '16 / 9';
        el.classList.add('carousel-active');
      } else {
        el.style.display = 'none';
        el.classList.remove('carousel-active');
      }
    });

    updateCarouselButtons();
  }

  function showVideo(index) {
    if (videoElements.length === 0) return;
    currentVideoIndex = Math.max(0, Math.min(index, videoElements.length - 1));
    updateCarouselDisplay();
  }

  function showPrevVideo() {
    if (videoElements.length === 0) return;
    currentVideoIndex = (currentVideoIndex - 1 + videoElements.length) % videoElements.length;
    updateCarouselDisplay();
  }

  function showNextVideo() {
    if (videoElements.length === 0) return;
    currentVideoIndex = (currentVideoIndex + 1) % videoElements.length;
    updateCarouselDisplay();
  }

  function updateCarouselButtons() {
    const prevBtn = document.getElementById('prevVideo');
    const nextBtn = document.getElementById('nextVideo');
    if (!prevBtn || !nextBtn) return;

    const hasMultiple = videoElements.length > 1;
    prevBtn.disabled = !hasMultiple;
    nextBtn.disabled = !hasMultiple;
    prevBtn.style.opacity = hasMultiple ? '1' : '0.3';
    nextBtn.style.opacity = hasMultiple ? '1' : '0.3';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCarousel);
  } else {
    initCarousel();
  }

  window.videoCarousel = { showVideo, showPrevVideo, showNextVideo, updateCarousel };
})();
