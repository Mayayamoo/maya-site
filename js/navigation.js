function loadNavigation() { //add <li><a href="arts">Movies, Music and Art</a></li> later
    const navigationHTML = `
        <button class="menu-toggle">☰</button>
        <nav>
            <h1><a href="index">Maya Luna</a></h1>
            <ul>
                <li><a href="about">About</a></li>
                <li><a href="https://progressivebeacon.substack.com/">Blog</a></li>
                <li class="dropdown">
                    <button class="dropbtn">Work + Projects</button>
                    <div class="dropdown-content">
                        <a href="endeavours">Timeline</a>
                        <a href="Contract">Contract</a>
                    </div> 
                </li>                             
                <li><a href="https://x.com/envisionedluna">Twitter</a></li>
                <li><a href="https://www.guidedtrack.com/programs/lcf9n8s/run">Date me</a></li>
                <li><a href="https://github.com/Mayayamoo">github</a></li>
                <li><a href="https://throne.com/mayaluna">Wishlist</a></li>
                <li><a href="https://discord.gg/P9TJzQD44A">Discord</a></li>
                <li class="dropdown">
                    <button class="dropbtn">Other socials</button>
                    <div class="dropdown-content">
                        <a href="instagram">https://instagram.com/realmayaluna</a>
                        <a href="bluesky">https://bsky.app/profile/realmayaluna.bsky.social</a>
                        <a href="X">https://x.com/envisionedluna</a>
                <li><a href="contact">Contact</a></li>
            </ul>
        </nav>
    `;
    
    document.body.insertAdjacentHTML('afterbegin', navigationHTML);
    
    // Initialize navigation functionality after DOM insertion
    initializeNavigation();
}

function initializeNavigation() {
    const menuToggle = document.querySelector('.menu-toggle');
    const nav = document.querySelector('nav');

    if (menuToggle && nav) {
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
    }

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
            e.preventDefault();
            e.stopPropagation();
            
            // Close other dropdowns
            document.querySelectorAll('.dropdown-content').forEach(menu => {
                if (menu !== this.nextElementSibling) {
                    menu.classList.remove('show');
                }
            });
            
            const dropdown = this.nextElementSibling;
            if (dropdown) {
                dropdown.classList.toggle('show');
            }
        });
    });

    // Close dropdowns when clicking outside
    window.addEventListener('click', function(e) {
        if (!e.target.closest('.dropdown')) {
            document.querySelectorAll('.dropdown-content').forEach(menu => {
                menu.classList.remove('show');
            });
        }
    });
}

document.addEventListener('DOMContentLoaded', loadNavigation);