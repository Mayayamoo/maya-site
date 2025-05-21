const menuToggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('nav');

menuToggle.addEventListener('click', () => {
    nav.classList.toggle('active');
    menuToggle.textContent = nav.classList.contains('active') ? '✕' : '☰';
});

document.querySelectorAll('nav ul li a').forEach(link => {
    link.addEventListener('click', (e) => {
        document.querySelectorAll('nav ul li a').forEach(a => a.style.color = '#a0a0ff');
        e.target.style.color = '#fff';
        if (window.innerWidth <= 768) {
            nav.classList.remove('active');
            menuToggle.textContent = '☰';
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