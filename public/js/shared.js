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

// --- ENROLLED GOLFERS PDF GENERATION FUNCTION ---
async function generateGolfersDirectoryPDF(showToastFn = alert) {
    try {
        const res = await fetch('/api/golfers');
        if (!res.ok) throw new Error("Failed to fetch golfers list");
        
        const golfers = await res.json();
        
        // Filter out deactivated golfers
        const activeGolfers = golfers.filter(g => g.active !== false);

        if (!activeGolfers || activeGolfers.length === 0) {
            showToastFn("Error: No active golfers available to export", true);
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

        // Header Title
        doc.setFontSize(18);
        doc.setTextColor(46, 125, 50); // Dark Green
        doc.text("Golfers Contact Directory", 14, 18);

        // Subtitle Date
        const todayStr = new Date().toLocaleDateString('en-GB', {
            day: 'numeric', month: 'long', year: 'numeric'
        });
        doc.setFontSize(10);
        doc.setTextColor(100, 100, 100);
        doc.text(`Generated on: ${todayStr} (${activeGolfers.length} Active Members Listed)`, 14, 25);

        // Prepare table row data
        const tableRows = activeGolfers.map(g => [
            g.name || '',
            g.email || 'N/A',
            g.tel || 'N/A'
        ]);

        // Generate Styled AutoTable
        doc.autoTable({
            startY: 30,
            head: [['Name', 'Email Address', 'Telephone Number']],
            body: tableRows,
            theme: 'striped',
            headStyles: {
                fillColor: [46, 125, 50],
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                fontSize: 11
            },
            bodyStyles: {
                fontSize: 10,
                textColor: [50, 50, 50]
            },
            columnStyles: {
                0: { cellWidth: 55 },
                1: { cellWidth: 80 },
                2: { cellWidth: 45 }
            },
            alternateRowStyles: {
                fillColor: [241, 248, 233]
            }
        });

        // Trigger PDF Download
        const filename = `Golfers_Directory_${new Date().toISOString().split('T')[0]}.pdf`;
        doc.save(filename);

        showToastFn("Success: PDF roster created and downloaded!");
    } catch (err) {
        console.error("PDF Export Error:", err);
        showToastFn("Error: Failed to create PDF roster", true);
    }
}