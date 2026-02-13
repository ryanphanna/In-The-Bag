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
let currentContext = 'explore'; // 'home' | 'explore'
let currentView = 'items'; // 'items' | 'categories'
let selectedCategory = null;
let searchQuery = '';

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
        addBtn.addEventListener('click', () => {
            document.getElementById('add-modal').classList.remove('hidden');
        });
        addBtnContainer.appendChild(addBtn);

        container.appendChild(addBtnContainer);
    }

    // Search Bar (Items view only)
    if (currentView === 'items' && !selectedCategory) {
        const searchContainer = document.createElement('div');
        searchContainer.className = 'search-container';
        searchContainer.style.marginBottom = '1.5rem';

        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = 'Search items...';
        searchInput.className = 'search-input';
        searchInput.value = searchQuery;
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value;
            render();
            // Refocus after render if needed, but since we're re-rendering the whole slab it might lose focus.
            // A better way would be to only re-render the list or maintain focus.
            // For now, let's keep it simple and see.
        });

        searchContainer.appendChild(searchInput);
        container.appendChild(searchContainer);

        // Maintain focus if we were typing
        if (searchQuery) {
            setTimeout(() => {
                const input = document.querySelector('.search-input');
                if (input) {
                    input.focus();
                    input.setSelectionRange(searchQuery.length, searchQuery.length);
                }
            }, 0);
        }
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

        // Add 'Remove' button if in 'My Bag' context
        if (currentContext === 'home') {
            const removeBtn = document.createElement('button');
            removeBtn.className = 'btn-remove';
            removeBtn.textContent = 'Remove';
            removeBtn.style.fontSize = '0.7rem';
            removeBtn.style.marginTop = '0.5rem';
            removeBtn.style.color = '#cc0000';
            removeBtn.style.background = 'none';
            removeBtn.style.border = 'none';
            removeBtn.style.cursor = 'pointer';
            removeBtn.style.padding = '0';
            removeBtn.style.opacity = '0.6';

            removeBtn.addEventListener('click', () => {
                if (confirm(`Remove ${item.name} from your bag?`)) {
                    removeFromBag(item.id);
                }
            });
            li.appendChild(removeBtn);
        }

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

function renderUnifiedNav(items) {
    const unifiedNav = document.getElementById('unified-nav');

    // Hide nav bar entirely for guests
    if (!currentUserId) {
        unifiedNav.classList.add('hidden');
        return;
    }
    unifiedNav.classList.remove('hidden');

    unifiedNav.innerHTML = `
        <div class="nav-group">
            <button class="nav-tab ${currentContext === 'home' ? 'active' : ''}" id="nav-home">My Bag</button>
            <button class="nav-tab ${currentContext === 'explore' ? 'active' : ''}" id="nav-explore">Explore</button>
        </div>
        <div class="nav-group">
            <button class="nav-tab ${currentView === 'items' && !selectedCategory ? 'active' : ''}" id="view-items">
                Items
            </button>
            <button class="nav-tab ${currentView === 'categories' ? 'active' : ''}" id="view-categories">
                Categories
            </button>
        </div>
    `;

    // Event Listeners for Context
    document.getElementById('nav-home').addEventListener('click', () => {
        currentContext = 'home';
        currentView = 'items';
        selectedCategory = null;
        render();
    });

    document.getElementById('nav-explore').addEventListener('click', () => {
        currentContext = 'explore';
        currentView = 'items';
        selectedCategory = null;
        render();
    });

    // Event Listeners for Views
    document.getElementById('view-items').addEventListener('click', () => {
        selectedCategory = null;
        switchView('items');
    });
    document.getElementById('view-categories').addEventListener('click', () => switchView('categories'));
}

function getFilteredItems() {
    let items = gearItems;
    // 1. Filter by Context
    if (currentContext === 'home') {
        items = items.filter(item => item.ownerIds && item.ownerIds.includes(currentUserId));
        // Sort by Recently Added (createdAt)
        items.sort((a, b) => {
            const timeA = a.createdAt?.seconds || 0;
            const timeB = b.createdAt?.seconds || 0;
            return timeB - timeA;
        });
    } else {
        // Explore View - Sort by Popularity
        items.sort((a, b) => b.owners - a.owners);
    }
    // 2. Filter by Category (if selected)
    if (selectedCategory) {
        items = items.filter(item => item.category === selectedCategory);
    }
    // 3. Filter by Search Query
    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        items = items.filter(item =>
            item.name.toLowerCase().includes(query) ||
            item.category.toLowerCase().includes(query)
        );
    }
    return items;
}


function render() {
    const contextItems = currentContext === 'home'
        ? gearItems.filter(item => item.ownerIds && item.ownerIds.includes(currentUserId))
        : gearItems;

    const filteredItems = getFilteredItems();

    renderUnifiedNav(contextItems);

    if (currentView === 'items') {
        renderList(filteredItems);
    } else if (currentView === 'categories') {
        renderCategoriesView(contextItems);
    }

    if (selectedCategory) {
        const container = document.getElementById('gear-list-container');
        const filterStatus = document.createElement('div');
        filterStatus.style.padding = '0 0 1.5rem 0';
        filterStatus.style.fontSize = '0.9rem';
        filterStatus.style.color = '#666';
        filterStatus.innerHTML = `Filtering by: <strong>${selectedCategory}</strong> <button id="clear-filter" class="btn-minimal" style="font-size: 0.75rem; margin-left: 0.5rem; padding: 0.2rem 0.5rem;">Clear</button>`;
        container.prepend(filterStatus);

        document.getElementById('clear-filter').addEventListener('click', () => {
            selectedCategory = null;
            render();
        });
    }
}

function switchView(view) {
    currentView = view;
    render();
}


// Initial UI State
// Handled by onAuthStateChanged and render()

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

if (auth) {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUserId = user.uid;
            loginBtn.classList.add('hidden');
            userInfo.classList.remove('hidden');
            document.body.classList.add('logged-in');

            // Default to home if not set
            if (currentContext !== 'explore') {
                currentContext = 'home';
                currentView = 'items';
            }
        } else {
            currentUserId = null;
            loginBtn.classList.remove('hidden');
            userInfo.classList.add('hidden');

            // Force explore view if signed out
            currentContext = 'explore';
            currentView = 'items';
            document.body.classList.remove('logged-in');
        }
        render();
    });
} else {
    // Initial state if auth not ready (treat as guest)
    currentUserId = null;
    currentContext = 'explore';
    currentView = 'items';
    render();
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

async function removeFromBag(itemId) {
    if (!currentUserId) return;

    const { updateDoc, arrayRemove, increment, doc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
    const docRef = doc(db, 'gear', itemId);

    try {
        await updateDoc(docRef, {
            owners: increment(-1),
            ownerIds: arrayRemove(currentUserId)
        });
    } catch (error) {
        console.error("Error removing gear:", error);
        alert("Failed to remove gear. Try again.");
    }
}

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

