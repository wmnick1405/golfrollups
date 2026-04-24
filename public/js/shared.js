// public/js/shared.js

/**
 * 1. THE SMART FETCH TOOL
 * This replaces the standard 'fetch'. It automatically handles 
 * the 401 login check and converts data to JSON.
 */
async function apiFetch(url, options = {}) {
    try {
        const response = await fetch(url, options);
        
        // If the session expired, send them back to login
        if (response.status === 401) {
            window.location.href = 'index.html';
            return null;
        }
        
        return await response.json();
    } catch (err) {
        console.error("Fetch error:", err);
        return null;
    }
}

/**
 * 2. DATE FORMATTER
 * Converts "2026-03-25" into "25/03/2026"
 */
function formatDate(dateString) {
    if (!dateString) return "N/A";
    const d = new Date(dateString);
    return d.toLocaleDateString('en-GB');
}

/**
 * 3. NAVIGATION LOADER
 * Injects the menu into the 'nav-placeholder' div
 */
function loadNavigation() {
    const navElem = document.getElementById('nav-placeholder');
    if (navElem) {
        fetch('nav.html')
            .then(res => res.text())
            .then(data => {
                navElem.innerHTML = data;
            });
    }
}

// --- TOAST NOTIFICATION SYSTEM ---
// Inject CSS once when the page loads
const style = document.createElement('style');
style.innerHTML = `
    #toast-container { position: fixed; bottom: 20px; right: 20px; z-index: 1000; }
    .toast { background: #333; color: white; padding: 12px 24px; border-radius: 4px; margin-top: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); opacity: 0; transition: opacity 0.3s; }
`;
document.head.appendChild(style);

// Function to show a toast message
window.showToast = function(message) {
    console.log("Toast: function triggered"); // This will show in Console if called
    
    const container = document.getElementById('toast-container') || (function() {
        const div = document.createElement('div');
        div.id = 'toast-container';
        document.body.appendChild(div);
        return div;
    })();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => toast.style.opacity = '1', 10);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => container.removeChild(toast), 300);
    }, 3000);
};

// Automatically check login and load nav when page loads
document.addEventListener('DOMContentLoaded', () => {
    // Don't check login if we are already on the login page
    if (!window.location.pathname.endsWith('index.html') && 
        window.location.pathname !== '/') {
        // We do a quick test fetch to see if we are logged in
        apiFetch('/api/golfers');
    }
    loadNavigation();
});

// Shared logout function
async function handleLogout() {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = 'index.html';
}