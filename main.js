/*
 * 十六月書房 -しがつのへや-
 * Interaction Logic
 */

document.addEventListener('DOMContentLoaded', () => {
    
    // スクロール時のナビゲーションバーの背景変更
    const navbar = document.querySelector('.navbar');
    
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.add('scrolled'); /* Actually let's just make it always slightly dark on scroll */
            if (window.scrollY === 0) {
                navbar.classList.remove('scrolled');
            }
        }
    });

    // フェードインアニメーションの監視 (Intersection Observer)
    const fadeElements = document.querySelectorAll('.about-grid, .coffee-story, .work-card, .social-btn');
    
    // 初期状態で非表示クラスを付与
    fadeElements.forEach(el => {
        el.classList.add('fade-in-element');
    });

    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.15
    };

    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                // 一度表示されたら監視を解除（毎回目のアニメーションを避けるため）
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    fadeElements.forEach(el => {
        observer.observe(el);
    });

    // スムーズスクロール (アンカーリンク)
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                window.scrollTo({
                    top: targetElement.offsetTop,
                    behavior: 'smooth'
                });
            }
        });
    });

    // BGM Logic
    const bgm = new Audio('assets/03 Home Sweet Home feat. KMNZ LIZ.mp3');
    bgm.volume = 0.3;
    bgm.loop = false;

    let isPlaying = false;
    let isMutedUserPreference = false;

    const muteBtn = document.getElementById('mute-btn');
    const restartBtn = document.getElementById('restart-btn');
    const volumeSlider = document.getElementById('volume-slider');
    const entranceOverlay = document.getElementById('entrance-overlay');
    const btnEnter = document.getElementById('btn-enter');
    const btnEnterMuted = document.getElementById('btn-enter-muted');

    // Entrance Logic
    if (entranceOverlay && btnEnter && btnEnterMuted) {
        document.body.style.overflow = 'hidden'; // Prevent scroll until enter

        const enterSite = (playMusic) => {
            entranceOverlay.classList.add('hidden');
            document.body.style.overflow = ''; 
            
            if (playMusic) {
                bgm.play().then(() => {
                    isPlaying = true;
                    isMutedUserPreference = false;
                    bgm.muted = false;
                    if(muteBtn) muteBtn.textContent = '🔊';
                }).catch(e => console.log(e));
            } else {
                bgm.muted = true;
                isMutedUserPreference = true;
                if(muteBtn) muteBtn.textContent = '🔇';
                bgm.play().then(() => {
                    isPlaying = true;
                }).catch(e => console.log(e));
            }
            
            setTimeout(() => {
                entranceOverlay.style.display = 'none';
            }, 800);
        };

        btnEnter.addEventListener('click', () => enterSite(true));
        btnEnterMuted.addEventListener('click', () => enterSite(false));
    }

    if (muteBtn) {
        muteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (bgm.muted || bgm.volume === 0 || !isPlaying) {
                bgm.muted = false;
                if (bgm.volume === 0) {
                    bgm.volume = 0.3;
                    if(volumeSlider) volumeSlider.value = 0.3;
                }
                if (!isPlaying) {
                    bgm.play().then(() => isPlaying = true).catch(e => console.log(e));
                }
                muteBtn.textContent = '🔊';
                isMutedUserPreference = false;
            } else {
                bgm.muted = true;
                muteBtn.textContent = '🔇';
                isMutedUserPreference = true;
            }
        });
    }

    if (volumeSlider) {
        volumeSlider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            bgm.volume = val;
            if (val > 0) {
                bgm.muted = false;
                isMutedUserPreference = false;
                if(muteBtn) muteBtn.textContent = '🔊';
                if (!isPlaying) {
                    bgm.play().then(() => isPlaying = true).catch(e => console.log(e));
                }
            } else {
                bgm.muted = true;
                if(muteBtn) muteBtn.textContent = '🔇';
            }
        });
    }

    if (restartBtn) {
        restartBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            bgm.currentTime = 0;
            if (!isPlaying || bgm.paused) {
                bgm.play().then(() => {
                    isPlaying = true;
                    if (!isMutedUserPreference && bgm.volume > 0) {
                        bgm.muted = false;
                        if(muteBtn) muteBtn.textContent = '🔊';
                    }
                }).catch(e => console.log(e));
            }
        });
    }
});
