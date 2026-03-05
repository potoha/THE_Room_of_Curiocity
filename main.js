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
});
