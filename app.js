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
let currentUserId = null;
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

        const addBtn = document.createElement('button');
        addBtn.id = "add-gear-btn-top";
        addBtn.className = "btn-minimal";
        addBtn.textContent = "+ Add Item";
        addBtnContainer.appendChild(addBtn);

        container.appendChild(addBtnContainer);

        addBtn.addEventListener('click', () => {
            document.getElementById('add-modal').classList.remove('hidden');
        });
    }

    if (items.length === 0) {
        const msg = document.createElement('div');
        msg.className = "empty-state";
        msg.style.textAlign = "center";
        msg.style.color = "#999";
        msg.style.padding = "4rem 2rem";

        const p = document.createElement('p');
        p.textContent = "No items found in this bag.";
        msg.appendChild(p);

        // Add seed button for local development
        if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
            const seedBtn = document.createElement('button');
            seedBtn.id = "seed-btn";
            seedBtn.className = "btn-minimal";
            seedBtn.style.marginTop = "2rem";
            seedBtn.textContent = "Seed Demo Data";
            seedBtn.addEventListener('click', seedData);
            msg.appendChild(seedBtn);
        }

        container.appendChild(msg);
        return;
    }


    const list = document.createElement('ul');
    list.className = 'item-list';

    items.forEach(item => {
        const li = document.createElement('li');
        li.className = 'item';
        // Inline styles moved to CSS class ideally, but keeping structural changes minimal here
        li.style.flexDirection = 'column';
        li.style.alignItems = 'flex-start';
        li.style.gap = '0.25rem';

        const topRow = document.createElement('div');
        topRow.style.display = 'flex';
        topRow.style.justifyContent = 'space-between';
        topRow.style.width = '100%';
        topRow.style.alignItems = 'center';

        const itemInfo = document.createElement('div');
        itemInfo.className = 'item-info';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'item-name';
        nameSpan.textContent = item.name;

        const categorySpan = document.createElement('span');
        categorySpan.className = 'item-meta';
        categorySpan.style.marginLeft = '0.5rem';
        categorySpan.style.fontSize = '0.75rem';
        categorySpan.style.background = '#f0f0f0';
        categorySpan.style.padding = '2px 6px';
        categorySpan.style.borderRadius = '4px';
        categorySpan.textContent = item.category;

        itemInfo.appendChild(nameSpan);
        itemInfo.appendChild(categorySpan);

        const ownersSpan = document.createElement('span');
        ownersSpan.className = 'item-meta';
        ownersSpan.textContent = `${item.owners || 1} owners`;

        topRow.appendChild(itemInfo);
        topRow.appendChild(ownersSpan);
        li.appendChild(topRow);

        // Logic check for Note:
        // 1. Check item.notes[currentUserId] (New Logic)
        // 2. Check item.note (Legacy/Seed Logic)
        let noteText = '';
        if (item.notes && currentUserId && item.notes[currentUserId]) {
            noteText = item.notes[currentUserId];
        } else if (item.note) {
            // For legacy items, we might want to only show if the user is the owner, 
            // but current seed items don't have ownerIds set properly sometimes.
            // We'll show it if it exists for now to maintain parity with old code.
            noteText = item.note;
        }

        if (noteText) {
            const noteDiv = document.createElement('div');
            noteDiv.className = 'item-note';
            noteDiv.style.fontSize = '0.85rem';
            noteDiv.style.color = '#666';
            noteDiv.style.fontStyle = 'italic';
            noteDiv.style.borderLeft = '2px solid #e5e5e5';
            noteDiv.style.paddingLeft = '0.75rem';
            noteDiv.style.marginTop = '0.5rem';
            noteDiv.textContent = `"${noteText}"`; // Safe text content
            li.appendChild(noteDiv);
        }

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
    // Default to showing by popularity (owners)
    currentView = 'owners';
    render();
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
    console.log('Email link detected, attempting sign-in...');
    let email = window.localStorage.getItem('emailForSignIn');
    if (!email) {
        email = window.prompt('Please provide your email for confirmation');
    }
    console.log('Signing in with email:', email);
    signInWithEmailLink(auth, email, window.location.href)
        .then((result) => {
            console.log('Sign-in successful!', result.user);
            window.localStorage.removeItem('emailForSignIn');
            // Clear URL parameters
            window.history.replaceState({}, document.title, "/");
        })
        .catch((error) => {
            console.error("Error signing in with email link", error);
            let msg = error.message;
            if (msg.includes("auth/api-key-not-valid")) {
                msg = "Configuration Error: API Key invalid. Check your Firebase Console settings.";
            }
            alert("Error signing in: " + msg);
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

const authForm = document.getElementById('auth-form');
authForm.addEventListener('submit', (e) => {
    e.preventDefault(); // Prevent page reload

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
            let msg = error.message;
            if (msg.includes("auth/api-key-not-valid")) {
                msg = "Configuration Error: API Key invalid. Check your Firebase Console settings.";
            }
            authMessage.textContent = `Error: ${msg}`;
            authMessage.classList.remove('hidden');
        });
});


logoutBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    await signOut(auth);
});

// Modal Logic
const addModal = document.getElementById('add-modal');
const closeModal = document.getElementById('close-modal');
const addGearForm = document.getElementById('add-gear-form');

closeModal.addEventListener('click', () => {
    addModal.classList.add('hidden');
    addGearForm.reset();
});

addGearForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!currentUserId) {
        alert("Please sign in to add gear.");
        return;
    }

    const name = document.getElementById('gear-name').value.trim();
    const category = document.getElementById('gear-category').value.trim();

    if (!name || !category) {
        alert("Please fill in product name and category.");
        return;
    }

    // Dynamic Import for additional Firestore functions
    const { updateDoc, arrayUnion, increment, getDocs, where } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");

    try {
        // 1. Check if item exists
        const q = query(gearCollection, where("name", "==", name));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            // Item Exists - Update it
            const existingDoc = querySnapshot.docs[0];
            const docRef = existingDoc.ref;

            // Check if user already owns it
            const data = existingDoc.data();
            if (data.ownerIds && data.ownerIds.includes(currentUserId)) {
                alert("You already have this item in your bag!");
                return;
            }

            await updateDoc(docRef, {
                owners: increment(1),
                ownerIds: arrayUnion(currentUserId)
            });

        } else {
            // 2. Item New - Create it
            await addDoc(gearCollection, {
                name: name,
                category: category,
                owners: 1,
                ownerIds: [currentUserId],
                createdAt: serverTimestamp()
            });
        }

        addModal.classList.add('hidden');
        addGearForm.reset();
    } catch (error) {
        console.error("Error adding gear:", error);
        alert("Failed to add gear. Try again.");
    }
});

async function seedData() {
    const demoGear = [
        { name: 'Sony A7IV', category: 'Camera', owners: 42, ownerIds: [], notes: { 'system': 'My daily driver for everything.' } },
        { name: 'MacBook Pro M3', category: 'Computer', owners: 15, ownerIds: [], notes: { 'system': 'Absurdly fast.' } },
        { name: 'Keychron Q1', category: 'Peripheral', owners: 8, ownerIds: [], notes: { 'system': 'Heavy, but worth it.' } },
        { name: 'Peak Design Zip 15L', category: 'Bag', owners: 23, ownerIds: [], notes: { 'system': 'Perfect size for day trips.' } }
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

