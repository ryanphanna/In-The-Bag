import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";


// Initialize Firebase
let app, auth, db;
try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
} catch (error) {
    console.error("Firebase initialization failed:", error);
}

// State
let gearItems = [];
const gearCollection = collection(db, 'gear');

// Subscribe to Firestore updates
try {
    onSnapshot(query(gearCollection), (snapshot) => {
        gearItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        render();
    }, (error) => {
        console.error("Firestore subscription error:", error);
        // Still render to show the seed button if on localhost
        if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
            render();
        }
    });
} catch (e) {
    console.error("Failed to setup logic:", e);
    render();
}



// State
let currentContext = 'home'; // 'home' | 'directory'
let currentView = 'items'; // 'items' | 'categories' | 'owners'
let selectedCategory = null;

// UI Rendering
function renderList(items) {
    const container = document.getElementById('gear-list-container');
    container.innerHTML = '';

    // Add 'Add Item' button at the top if authorized
    if (currentUserId) {
        const addBtnContainer = document.createElement('div');
        addBtnContainer.style.marginBottom = '2rem';
        addBtnContainer.style.textAlign = 'right';
        addBtnContainer.innerHTML = `<button id="add-gear-btn-top" class="btn-minimal">+ Add Item</button>`;
        container.appendChild(addBtnContainer);

        document.getElementById('add-gear-btn-top').addEventListener('click', () => {
            document.getElementById('add-modal').classList.remove('hidden');
        });
    }

    if (items.length === 0) {
        const msg = document.createElement('div');
        msg.className = "empty-state";
        msg.style.textAlign = "center";
        msg.style.color = "#999";
        msg.style.padding = "4rem 2rem";

        let html = `<p>No items found in this bag.</p>`;

        // Add seed button for local development
        if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
            html += `<button id="seed-btn" class="btn-minimal" style="margin-top: 2rem;">Seed Demo Data</button>`;
        }

        msg.innerHTML = html;
        container.appendChild(msg);

        if (document.getElementById('seed-btn')) {
            document.getElementById('seed-btn').addEventListener('click', seedData);
        }
        return;
    }


    const list = document.createElement('ul');
    list.className = 'item-list';

    items.forEach(item => {
        const li = document.createElement('li');
        li.className = 'item';
        li.style.flexDirection = 'column';
        li.style.alignItems = 'flex-start';
        li.style.gap = '0.25rem';
        li.innerHTML = `
            <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
                <div class="item-info">
                    <span class="item-name">${item.name}</span>
                    <span class="item-meta" style="margin-left: 0.5rem; font-size: 0.75rem; background: #f0f0f0; padding: 2px 6px; border-radius: 4px;">${item.category}</span>
                </div>
                <span class="item-meta">${item.owners || 1} owners</span>
            </div>
            ${item.note ? `<div class="item-note" style="font-size: 0.85rem; color: #666; font-style: italic; border-left: 2px solid #e5e5e5; padding-left: 0.75rem; margin-top: 0.5rem;">"${item.note}"</div>` : ''}
        `;
        list.appendChild(li);
    });


    container.appendChild(list);
}

function renderCategoriesView(items) {
    const container = document.getElementById('gear-list-container');
    container.innerHTML = '';

    const categories = [...new Set(items.map(i => i.category))];

    categories.forEach(cat => {
        const catHeader = document.createElement('div');
        catHeader.className = 'category-header';
        catHeader.textContent = cat;
        catHeader.style.cursor = 'pointer';
        catHeader.addEventListener('click', () => {
            selectedCategory = cat;
            switchView('items');
        });
        container.appendChild(catHeader);

        const list = document.createElement('ul');
        list.className = 'item-list';

        const catItems = items.filter(i => i.category === cat);
        catItems.forEach(item => {
            const li = document.createElement('li');
            li.className = 'item';
            li.innerHTML = `
                <span class="item-name">${item.name}</span>
                <span class="item-meta">${item.owners} owners</span>
            `;
            list.appendChild(li);
        });
        container.appendChild(list);
    });
}

function renderOwnersView(items) {
    const container = document.getElementById('gear-list-container');
    container.innerHTML = '';

    const sortedByOwners = [...items].sort((a, b) => b.owners - a.owners);

    const list = document.createElement('ul');
    list.className = 'item-list';

    sortedByOwners.forEach(item => {
        const li = document.createElement('li');
        li.className = 'item';
        li.innerHTML = `
            <div>
                <span class="item-name">${item.name}</span>
                <div class="item-meta">${item.category}</div>
            </div>
            <span class="item-value" style="font-weight: 600; font-size: 1.1rem;">${item.owners}</span>
        `;
        list.appendChild(li);
    });

    container.appendChild(list);
}

function renderStats(items) {
    const statsSummary = document.getElementById('stats-summary');
    const totalItems = items.length; // Items in current context
    const totalOwners = items.reduce((sum, i) => sum + i.owners, 0);
    const totalCategories = new Set(items.map(i => i.category)).size;

    statsSummary.innerHTML = `
    <hr class="divider">
    <div class="stats">
      <div class="stat ${currentView === 'items' && !selectedCategory ? 'active' : ''}" id="stat-items">
        <span class="stat-value">${totalItems}</span>
        <span class="stat-label">Items</span>
      </div>
      <div class="stat ${currentView === 'categories' ? 'active' : ''}" id="stat-categories">
        <span class="stat-value">${totalCategories}</span>
        <span class="stat-label">Categories</span>
      </div>
      <div class="stat ${currentView === 'owners' ? 'active' : ''}" id="stat-owners">
        <span class="stat-value">${totalOwners}</span>
        <span class="stat-label">Owners</span>
      </div>
    </div>
    <hr class="divider">
    ${selectedCategory ? `<div style="text-align: center; margin-bottom: 1rem; color: #666;">Filtering by: <strong>${selectedCategory}</strong> <button id="clear-filter" class="btn-minimal" style="font-size: 0.7rem; margin-left: 0.5rem;">Clear</button></div>` : ''}
  `;

    document.getElementById('stat-items').addEventListener('click', () => {
        selectedCategory = null;
        switchView('items');
    });
    document.getElementById('stat-categories').addEventListener('click', () => switchView('categories'));
    document.getElementById('stat-owners').addEventListener('click', () => switchView('owners'));

    if (selectedCategory) {
        document.getElementById('clear-filter').addEventListener('click', () => {
            selectedCategory = null;
            render();
        });
    }
}

function getFilteredItems() {
    let items = gearItems;
    // 1. Filter by Context
    if (currentContext === 'home') {
        items = items.filter(item => item.ownerIds && item.ownerIds.includes(currentUserId));
    }
    // 2. Filter by Category (if selected)
    if (selectedCategory) {
        items = items.filter(item => item.category === selectedCategory);
    }
    return items;
}


function render() {
    const items = getFilteredItems();
    // Pass ALL context items to stats, not just category-filtered ones,
    // so stats show total counts context-wide.
    // Actually, stats usually show what is displayed.
    // Let's pass the context-only items to stats to show total available in this context.
    const contextItems = currentContext === 'home'
        ? gearItems.filter(item => item.ownerIds && item.ownerIds.includes(currentUserId))
        : gearItems;


    renderStats(contextItems);

    if (currentView === 'items') {
        renderList(items);
    } else if (currentView === 'categories') {
        renderCategoriesView(contextItems); // Show all categories in context
    } else if (currentView === 'owners') {
        renderOwnersView(contextItems);
    }

    updateNavState();
}

function switchView(view) {
    currentView = view;
    render();
}

function switchContext(context) {
    currentContext = context;
    currentView = 'items'; // Reset view when switching context
    render();
}

// Event Listeners
document.getElementById('nav-home').addEventListener('click', (e) => {
    e.preventDefault();
    if (currentUserId) {
        switchContext('home');
    }
});

document.getElementById('nav-directory').addEventListener('click', (e) => {
    e.preventDefault();
    switchContext('directory');
});

function updateNavState() {
    // Nav Visibility
    const navHome = document.getElementById('nav-home');
    if (currentUserId) {
        navHome.classList.remove('hidden');
    } else {
        navHome.classList.add('hidden');
    }

    // Active States
    navHome.classList.toggle('active', currentContext === 'home');
    document.getElementById('nav-directory').classList.toggle('active', currentContext === 'directory');

    // Header text is static "In The Bag" now, so no updates needed here.
}

// Auth Logic
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const userInfo = document.getElementById('user-info');
const userName = document.getElementById('user-name');

// Auth Modal Elements
const authModal = document.getElementById('auth-modal');
const authEmail = document.getElementById('auth-email');
const sendLinkBtn = document.getElementById('send-link-btn');
const closeAuthModal = document.getElementById('close-auth-modal');
const authMessage = document.getElementById('auth-message');

// Initial UI State
document.getElementById('nav-home').classList.add('hidden');

if (auth) {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUserId = user.uid;
            loginBtn.classList.add('hidden');
            userInfo.classList.remove('hidden');
            userName.textContent = user.email ? user.email.split('@')[0] : 'User'; // Use email handle as name

            // Show My Bag since we are logged in
            document.getElementById('nav-home').classList.remove('hidden');

            // Default to home if not set
            if (currentContext !== 'directory') {
                switchContext('home');
            }
        } else {
            currentUserId = null;
            loginBtn.classList.remove('hidden');
            userInfo.classList.add('hidden');

            // Hide My Bag since we are logged out
            document.getElementById('nav-home').classList.add('hidden');

            // Force directory view if signed out
            switchContext('directory');
        }
        // Update nav state to ensure active classes are correct
        updateNavState();
    });
} else {
    // Initial state if auth not ready (treat as guest)
    currentUserId = null;
    document.getElementById('nav-home').classList.add('hidden');
    switchContext('directory');
}

// Check for Magic Link on Load
if (isSignInWithEmailLink(auth, window.location.href)) {
    let email = window.localStorage.getItem('emailForSignIn');
    if (!email) {
        email = window.prompt('Please provide your email for confirmation');
    }
    signInWithEmailLink(auth, email, window.location.href)
        .then((result) => {
            window.localStorage.removeItem('emailForSignIn');
            // Clear URL parameters
            window.history.replaceState({}, document.title, "/");
        })
        .catch((error) => {
            console.error("Error signing in with email link", error);
            alert("Error signing in: " + error.message);
        });
}


loginBtn.addEventListener('click', () => {
    authModal.classList.remove('hidden');
    authMessage.classList.add('hidden');
    authMessage.textContent = '';
});

closeAuthModal.addEventListener('click', () => {
    authModal.classList.add('hidden');
});

sendLinkBtn.addEventListener('click', () => {
    const email = authEmail.value;
    if (!email) {
        alert('Please enter a valid email.');
        return;
    }

    const actionCodeSettings = {
        url: window.location.href, // Redirect back to this page
        handleCodeInApp: true,
    };

    sendSignInLinkToEmail(auth, email, actionCodeSettings)
        .then(() => {
            window.localStorage.setItem('emailForSignIn', email);
            authMessage.textContent = `Magic link sent to ${email}! Check your inbox.`;
            authMessage.classList.remove('hidden');
            authEmail.value = '';
        })
        .catch((error) => {
            console.error("Error sending email link", error);
            authMessage.textContent = `Error: ${error.message}`;
            authMessage.classList.remove('hidden');
        });
});

logoutBtn.addEventListener('click', async () => {
    await signOut(auth);
});

// Modal Logic
const addModal = document.getElementById('add-modal');
// const addBtn = document.getElementById('add-gear-btn'); // Removed from DOM
const fetchBtn = document.getElementById('fetch-btn');
const closeModal = document.getElementById('close-modal');
const gearUrl = document.getElementById('gear-url');
const preview = document.getElementById('preview');

// addBtn (now dynamic) is handled in renderList
closeModal.addEventListener('click', () => {
    addModal.classList.add('hidden');
    preview.classList.add('hidden');
    gearUrl.value = '';
});

fetchBtn.addEventListener('click', async () => {
    const url = gearUrl.value;
    if (!url) return;

    fetchBtn.textContent = 'Fetching...';
    await new Promise(r => setTimeout(r, 1000));

    try {
        const domain = new URL(url).hostname;
        const name = domain.split('.').length > 2 ? domain.split('.')[1] : domain.split('.')[0];
        const formattedName = name.charAt(0).toUpperCase() + name.slice(1);

        document.getElementById('preview-content').innerHTML = `
            <div style="font-weight: 600; color: #111;">Found: ${formattedName}</div>
            <div style="font-size: 0.85rem; color: #999; margin-top: 0.25rem;">Suggested Category: Tech</div>
        `;
        preview.classList.remove('hidden');

        // Note: listener is re-attached here to capture closure variables
        const confirmBtn = document.getElementById('confirm-add');
        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

        newConfirmBtn.addEventListener('click', async () => {
            if (!currentUserId) {
                alert("Please sign in to add gear.");
                return;
            }

            const note = document.getElementById('gear-note').value;

            try {
                await addDoc(gearCollection, {
                    name: formattedName,
                    category: 'Tech',
                    owners: 1,
                    ownerIds: [currentUserId],
                    note: note || '',
                    createdAt: serverTimestamp()
                });

                addModal.classList.add('hidden');
                preview.classList.add('hidden');
                gearUrl.value = '';
                document.getElementById('gear-note').value = '';
            } catch (error) {
                console.error("Error adding gear:", error);
                alert("Failed to add gear. Try again.");
            }
        });

    } catch (e) {
        alert("Invalid URL");
    } finally {
        fetchBtn.textContent = 'Fetch Details';
    }
});

async function seedData() {
    const demoGear = [
        { name: 'Sony A7IV', category: 'Camera', owners: 42, ownerIds: [], note: 'My daily driver for everything.' },
        { name: 'MacBook Pro M3', category: 'Computer', owners: 15, ownerIds: [], note: 'Absurdly fast.' },
        { name: 'Keychron Q1', category: 'Peripheral', owners: 8, ownerIds: [], note: 'Heavy, but worth it.' },
        { name: 'Peak Design Zip 15L', category: 'Bag', owners: 23, ownerIds: [], note: 'Perfect size for day trips.' }
    ];

    const btn = document.getElementById('seed-btn');
    btn.textContent = 'Seeding...';
    btn.disabled = true;

    try {
        for (const item of demoGear) {
            await addDoc(gearCollection, {
                ...item,
                createdAt: serverTimestamp()
            });
        }
        alert("Demo data seeded! Make sure Firestore is enabled in your console.");
    } catch (e) {
        console.error(e);
        alert("Error seeding data. Is Firestore enabled?");
    } finally {
        btn.textContent = 'Seed Demo Data';
        btn.disabled = false;
    }
}

