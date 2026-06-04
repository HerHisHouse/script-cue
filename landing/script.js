/* =============================================
   Script Cue Landing Page - JavaScript
   ============================================= */

document.addEventListener('DOMContentLoaded', () => {
    // Initialize all functionality
    initNavbar();
    initMobileMenu();
    initScrollAnimations();
    initSmoothScroll();
    initScrollSpy();
    initFeaturesCarousel();
});

/**
 * Navbar scroll behavior
 */
function initNavbar() {
    const navbar = document.getElementById('navbar');

    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });
}

/**
 * Mobile menu toggle
 */
function initMobileMenu() {
    const navToggle = document.getElementById('nav-toggle');
    const navMenu = document.getElementById('nav-menu');
    const navLinks = document.querySelectorAll('.nav-link');

    navToggle.addEventListener('click', () => {
        navToggle.classList.toggle('active');
        navMenu.classList.toggle('active');
        document.body.style.overflow = navMenu.classList.contains('active') ? 'hidden' : '';
    });

    // Close menu when clicking a link
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            navToggle.classList.remove('active');
            navMenu.classList.remove('active');
            document.body.style.overflow = '';
        });
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!navMenu.contains(e.target) && !navToggle.contains(e.target)) {
            navToggle.classList.remove('active');
            navMenu.classList.remove('active');
            document.body.style.overflow = '';
        }
    });
}

/**
 * Scroll-triggered animations using Intersection Observer
 */
function initScrollAnimations() {
    const animatedElements = document.querySelectorAll(
        '.feature-card, .mode-card, .step, .testimonial-card, .section-header, .checklist-item'
    );

    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry, index) => {
            if (entry.isIntersecting) {
                // Add staggered delay based on element index within its parent
                const parent = entry.target.parentElement;
                const siblings = Array.from(parent.children).filter(
                    child => child.classList.contains(entry.target.classList[0])
                );
                const siblingIndex = siblings.indexOf(entry.target);

                setTimeout(() => {
                    entry.target.classList.add('visible');
                }, siblingIndex * 100);

                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    animatedElements.forEach(el => {
        el.classList.add('fade-in');
        observer.observe(el);
    });
}

/**
 * Smooth scroll for anchor links
 */
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');

            if (targetId === '#') return;

            const targetElement = document.querySelector(targetId);

            if (targetElement) {
                const navbarHeight = document.getElementById('navbar').offsetHeight;
                const targetPosition = targetElement.offsetTop - navbarHeight - 20;

                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });
}

/**
 * Optional: Parallax effect for hero section
 */
function initParallax() {
    const hero = document.querySelector('.hero');
    const heroBg = document.querySelector('.hero-bg');

    window.addEventListener('scroll', () => {
        const scrolled = window.scrollY;
        if (scrolled < window.innerHeight) {
            heroBg.style.transform = `translateY(${scrolled * 0.3}px)`;
        }
    });
}

/**
 * Toggle FAQ accordion
 */
function toggleFAQ(button) {
    const faqItem = button.closest('.faq-item');
    const wasActive = faqItem.classList.contains('active');

    // Close all other FAQs in the same category (optional - remove if you want multiple open)
    const category = faqItem.closest('.faq-category');
    if (category) {
        category.querySelectorAll('.faq-item.active').forEach(item => {
            if (item !== faqItem) {
                item.classList.remove('active');
            }
        });
    }

    // Toggle current FAQ
    if (wasActive) {
        faqItem.classList.remove('active');
    } else {
        faqItem.classList.add('active');
    }
}

/**
 * Highlight active nav link based on scroll position
 */
function initScrollSpy() {
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav-menu .nav-link');

    window.addEventListener('scroll', () => {
        let current = '';
        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.clientHeight;
            // Activate when section is somewhat in view
            if (window.scrollY >= (sectionTop - 150)) {
                current = section.getAttribute('id');
            }
        });

        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === `#${current}`) {
                link.classList.add('active');
            }
        });
    });
}

/**
 * Features Mockup Carousel
 */
function initFeaturesCarousel() {
    const track = document.getElementById('featuresCarousel');
    const dots = document.querySelectorAll('.carousel-dot');
    if (!track || dots.length === 0) return;

    let currentIndex = 0;
    const totalSlides = dots.length;
    let autoPlayInterval;
    let isTransitioning = false;

    // Handle seamless loop after transition ends
    track.addEventListener('transitionend', () => {
        isTransitioning = false;
        if (currentIndex === totalSlides) {
            track.style.transition = 'none';
            currentIndex = 0;
            track.style.transform = `translateX(0%)`;
            // Force reflow to apply instant transform
            track.offsetHeight;
            track.style.transition = 'transform 0.8s cubic-bezier(0.4, 0, 0.2, 1)';
        }
    });

    const goToSlide = (index) => {
        if (isTransitioning && index !== currentIndex + 1) return; // Prevent spam clicking, allow autoplay

        if (index < 0) {
            // Seamless backwards: jump to clone, then slide to last real slide
            track.style.transition = 'none';
            track.style.transform = `translateX(-${totalSlides * 100}%)`;
            track.offsetHeight; // Force reflow
            track.style.transition = 'transform 0.8s cubic-bezier(0.4, 0, 0.2, 1)';
            index = totalSlides - 1;
        }
        
        isTransitioning = true;
        currentIndex = index;
        track.style.transform = `translateX(-${currentIndex * 100}%)`;
        
        dots.forEach(dot => dot.classList.remove('active'));
        if (currentIndex === totalSlides) {
            dots[0].classList.add('active');
        } else {
            dots[currentIndex].classList.add('active');
        }
    };

    const startAutoPlay = () => {
        stopAutoPlay();
        autoPlayInterval = setInterval(() => {
            goToSlide(currentIndex + 1);
        }, 3000);
    };

    const stopAutoPlay = () => {
        if (autoPlayInterval) {
            clearInterval(autoPlayInterval);
        }
    };

    // Click on dots
    dots.forEach((dot, index) => {
        dot.addEventListener('click', () => {
            goToSlide(index);
            startAutoPlay();
        });
    });

    // Touch events for swiping
    let startX = 0;
    let endX = 0;

    track.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        stopAutoPlay();
    }, { passive: true });

    track.addEventListener('touchmove', (e) => {
        endX = e.touches[0].clientX;
    }, { passive: true });

    track.addEventListener('touchend', () => {
        // Only process swipe if endX was updated (prevent click triggering swipe)
        if (endX === 0) {
            startAutoPlay();
            return;
        }

        const threshold = 40;
        const deltaX = startX - endX;
        
        // If swipe left (next)
        if (deltaX > threshold) {
            goToSlide(currentIndex + 1);
        }
        // If swipe right (prev)
        else if (deltaX < -threshold) {
            goToSlide(currentIndex - 1);
        }
        
        startAutoPlay();
        startX = 0;
        endX = 0;
    });

    // Start initial autoplay
    startAutoPlay();
}
