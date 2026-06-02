// GSM (Global Scalable Matrix) Real-time Control Center & Landing Page Logic
//
// Bu frontend, gsm-backend (Go API) ile cross-subdomain (app.gsm.app <-> api.gsm.app)
// iletisim kurar. Cookie tabanli oturum yonetimi icin tum fetch cagrilarinda
// credentials: 'include' zorunludur.

const API_BASE = window.location.origin;
let updateInterval = null;

// DOM Elemanları - Landing Page
const landingSection = document.getElementById('landing-section');
const responsibilityCheck = document.getElementById('responsibility-check');
const googleConnectBtn = document.getElementById('google-connect-btn');

// DOM Elemanları - Dashboard
const dashboardSection = document.getElementById('dashboard-section');
const systemStatusBadge = document.getElementById('system-status');
const metricCpu = document.getElementById('metric-cpu');
const metricMem = document.getElementById('metric-mem');
const metricNodes = document.getElementById('metric-nodes');
const metricPing = document.getElementById('metric-ping');
const cpuBar = document.getElementById('cpu-bar');
const memBar = document.getElementById('mem-bar');
const streamContainer = document.getElementById('event-stream-container');
const eventTypeInput = document.getElementById('event-type');
const eventPayloadInput = document.getElementById('event-payload');
const btnPublish = document.getElementById('btn-publish');
const btnClearFeed = document.getElementById('btn-clear-feed');

// Başlangıç Kurulumları
document.addEventListener('DOMContentLoaded', () => {
    // 1. Session Durumuna göre UI Seçimi
    const sessionToken = getCookie("gsm_session");

    if (sessionToken) {
        // Giriş yapılmış: Dashboard'a geç
        landingSection.classList.add('hidden');
        dashboardSection.classList.remove('hidden');

        initializeDashboard();
    } else {
        // Giriş yapılmamış: Landing Page göster
        landingSection.classList.remove('hidden');
        dashboardSection.classList.add('hidden');

        initializeLandingPage();
    }
});

// --- LANDING PAGE MANTIĞI ---

function initializeLandingPage() {
    // Checkbox durumuna göre butonu aktifleştirme dinleyicisi
    responsibilityCheck.addEventListener('change', (e) => {
        if (e.target.checked) {
            // Aktif State (Smooth Google SSO Styling)
            googleConnectBtn.classList.remove('pointer-events-none', 'text-slate-500', 'bg-slate-800/40');
            googleConnectBtn.classList.add('text-slate-900', 'bg-white', 'hover:bg-slate-100', 'border-white');
            googleConnectBtn.style.boxShadow = "0 10px 25px rgba(255, 255, 255, 0.08), 0 0 20px rgba(66, 133, 244, 0.15)";
        } else {
            // Pasif State (Disabled)
            googleConnectBtn.classList.add('pointer-events-none', 'text-slate-500', 'bg-slate-800/40');
            googleConnectBtn.classList.remove('text-slate-900', 'bg-white', 'hover:bg-slate-100', 'border-white');
            googleConnectBtn.style.boxShadow = "none";
        }
    });
}

// --- DASHBOARD MANTIĞI ---

function initializeDashboard() {
    checkSystemStatus();
    fetchEvents();

    // Düzenli asenkron metrik güncelleme döngüsü (2.5 saniyede bir)
    updateInterval = setInterval(() => {
        checkSystemStatus();
        fetchEvents();
    }, 2500);

    // Event Dinleyicileri
    btnPublish.addEventListener('click', injectEvent);
    btnClearFeed.addEventListener('click', () => {
        streamContainer.innerHTML = '<div class="text-slate-500 italic text-center py-10">Stream cleared. Waiting for events...</div>';
    });
}

// Sistem Bağlantı Durumu Kontrolü
async function checkSystemStatus() {
    const startTime = Date.now();
    try {
        const response = await fetch(`${API_BASE}/api/status`, { credentials: 'include' });
        const duration = Date.now() - startTime;

        if (response.ok) {
            const data = await response.json();
            systemStatusBadge.textContent = "OPERATIONAL";
            systemStatusBadge.className = "text-xs font-bold px-3 py-1.5 rounded-full bg-google-green/10 border border-google-green/30 text-google-green";
            metricPing.textContent = `${duration} ms`;
        } else {
            setDisconnectedState();
        }
    } catch (error) {
        setDisconnectedState();
    }
}

function setDisconnectedState() {
    systemStatusBadge.textContent = "OFFLINE";
    systemStatusBadge.className = "text-xs font-bold px-3 py-1.5 rounded-full bg-google-red/10 border border-google-red/30 text-google-red";
    metricPing.textContent = "-- ms";

    // Eğer oturum sunucu tarafında kapandıysa landing page'e geri atalım (Güvenlik)
    const sessionToken = getCookie("gsm_session");
    if (!sessionToken) {
        clearInterval(updateInterval);
        window.location.reload();
    }
}

// Olayları Çekme ve Ekrana Basma
async function fetchEvents() {
    try {
        const response = await fetch(`${API_BASE}/api/events`, { credentials: 'include' });
        if (!response.ok) return;

        const events = await response.json();
        if (events && events.length > 0) {
            renderEventStream(events);
            // En son sistem metriğini alıp barları güncelle
            const systemTicks = events.filter(e => e.type === 'SYSTEM_METRIC_TICK');
            if (systemTicks.length > 0) {
                const latestTick = systemTicks[systemTicks.length - 1];
                updateMetricsUI(latestTick.payload);
            }
        }
    } catch (error) {
        console.error("Error fetching matrix events:", error);
    }
}

// Metrik Kartlarının Güncellenmesi (Barlar ve Yazılar)
function updateMetricsUI(payload) {
    if (!payload) return;

    const cpuVal = payload.cpu_usage || 0;
    const memVal = payload.memory_free_gb || 0;
    const nodesVal = payload.active_nodes || 0;

    metricCpu.textContent = `${cpuVal.toFixed(1)}%`;
    cpuBar.style.width = `${cpuVal}%`;

    // 16GB RAM üzerinden doluluk hesaplama
    const memPercent = ((16 - memVal) / 16) * 100;
    metricMem.textContent = `${(16 - memVal).toFixed(1)} / 16 GB`;
    memBar.style.width = `${memPercent}%`;

    metricNodes.textContent = nodesVal;
}

// Olay Akışı Log Gösterimi
function renderEventStream(events) {
    streamContainer.innerHTML = '';

    events.slice().reverse().forEach(event => {
        const logCard = document.createElement('div');
        logCard.className = "bg-slate-900/60 border-l-2 p-3 rounded-r-lg font-mono text-[11px] flex flex-col gap-1.5 animation-slide-in";

        if (event.type.includes('SYSTEM')) {
            logCard.classList.add('border-google-green');
        } else if (event.type.includes('CUSTOM')) {
            logCard.classList.add('border-google-blue');
        } else {
            logCard.classList.add('border-google-yellow');
        }

        const timestamp = new Date(event.timestamp).toLocaleTimeString();

        logCard.innerHTML = `
            <div class="flex justify-between text-slate-500 text-[10px]">
                <span class="font-bold text-slate-300">${event.type}</span>
                <span>${timestamp}</span>
            </div>
            <div class="text-indigo-300 overflow-x-auto whitespace-pre">${JSON.stringify(event.payload, null, 2)}</div>
        `;
        streamContainer.appendChild(logCard);
    });
}

// Manuel Olay Yayınlama
async function injectEvent() {
    const type = eventTypeInput.value.trim();
    let payload = {};

    try {
        payload = JSON.parse(eventPayloadInput.value);
    } catch (e) {
        alert("Payload must be valid JSON!");
        return;
    }

    if (!type) {
        alert("Event type is required!");
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/publish`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ type, payload })
        });

        if (response.ok) {
            // Butona basıldığında mikro-küçülme efekti
            btnPublish.style.transform = 'scale(0.98)';
            setTimeout(() => btnPublish.style.transform = 'none', 100);
            fetchEvents();
        } else {
            alert("Failed to inject event into Matrix");
        }
    } catch (error) {
        console.error("Error injecting event:", error);
    }
}

// Yardımcı Fonksiyon: Cookie (Çerez) Okuma
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
}

// SDK Sekme Değiştirici (Landing Page için)
window.switchTab = function(lang) {
    // Tüm kod bloklarını gizle
    document.querySelectorAll('.sdk-code-block').forEach(block => {
        block.classList.add('hidden');
        block.classList.remove('block');
    });
    // Seçilen dilin kod bloğunu göster
    const activeBlock = document.getElementById(`code-${lang}`);
    if (activeBlock) {
        activeBlock.classList.remove('hidden');
        activeBlock.classList.add('block');
    }

    // Aktif sekme buton tasarımlarını sıfırla
    document.querySelectorAll('.sdk-tab-btn').forEach(btn => {
        btn.classList.remove('active', 'bg-slate-800', 'text-google-blue', 'font-bold', 'border', 'border-slate-700/50');
        btn.classList.add('text-slate-400');
    });

    // Tıklanan butona aktif stilleri ata
    const activeBtn = Array.from(document.querySelectorAll('.sdk-tab-btn')).find(btn => {
        const onclickAttr = btn.getAttribute('onclick');
        return onclickAttr && onclickAttr.includes(lang);
    });
    if (activeBtn) {
        activeBtn.classList.add('active', 'bg-slate-800', 'text-google-blue', 'font-bold', 'border', 'border-slate-700/50');
        activeBtn.classList.remove('text-slate-400');
    }
}
