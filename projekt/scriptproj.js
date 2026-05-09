document.addEventListener("DOMContentLoaded", function() {
    
    // Animace nacteni karet
    const cards = document.querySelectorAll('.output-card');
    
    cards.forEach((card, index) => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        card.style.transition = 'opacity 0.4s ease-out, transform 0.4s ease-out';
        
        setTimeout(() => {
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        }, 100 + (index * 100));
    });

    // Zamezeni prepinani 'active' tridy pri kliknuti na kotvu (#vystupy)
    const navLinks = document.querySelectorAll('.top-nav a');
    
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            if (this.getAttribute('href').startsWith('#')) {
                return; // Provede se jen plynuly scroll v CSS
            }
        });
    });
});