const menuToggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('nav');

menuToggle.addEventListener('click', () => {
    nav.classList.toggle('active');
    menuToggle.textContent = nav.classList.contains('active') ? '✕' : '☰';
    menuToggle.style.backgroundColor = nav.classList.contains('active') ? 
        'rgba(255, 50, 100, 0.8)' : 'rgba(0, 0, 0, 0.7)';
    menuToggle.style.color = nav.classList.contains('active') ? 
        '#ffffff' : '#ff3264';
    menuToggle.style.borderColor = nav.classList.contains('active') ? 
        'rgba(255, 255, 255, 0.5)' : 'rgba(255, 50, 100, 0.5)';
});

document.querySelectorAll('nav ul li a').forEach(link => {
    link.addEventListener('click', (e) => {
        document.querySelectorAll('nav ul li a').forEach(a => a.style.color = '#a0a0ff');
        e.target.style.color = '#fff';
        if (window.innerWidth <= 768) {
            nav.classList.remove('active');
            menuToggle.textContent = '☰';
            menuToggle.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
            menuToggle.style.color = '#ff3264';
            menuToggle.style.borderColor = 'rgba(255, 50, 100, 0.5)';
        }
    });
});

// Dropdown functionality for all dropdowns in nav

document.querySelectorAll('.dropbtn').forEach(btn => {
    btn.addEventListener('click', function(e) {
        e.stopPropagation();
        // Close other dropdowns
        document.querySelectorAll('.dropdown-content').forEach(menu => {
            if (menu !== this.nextElementSibling) menu.classList.remove('show');
        });
        const dropdown = this.nextElementSibling;
        dropdown.classList.toggle('show');
    });
});

window.addEventListener('click', function(e) {
    document.querySelectorAll('.dropdown-content').forEach(menu => {
        menu.classList.remove('show');
    });
});