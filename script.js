let allRecipes = [];
let currentRecipe = null;
let currentScale = 1;

const RECIPES_STORAGE_KEY = 'cached_recipes_data_v2';

const CATEGORIES = [
    { title: "סלטים", tag: "סלט", image: "images/cat_salads.jpg", gradient: "linear-gradient(135deg, #059669 0%, #065f46 100%)" },
    { title: "עוגות וקינוחים", tag: "עוגה", image: "images/cat_cakes.jpg", gradient: "linear-gradient(135deg, #d97706 0%, #b45309 100%)" },
    { title: "דגים", tag: "דגים", image: "images/ai_fish_dish.jpg", gradient: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)" },
    { title: "לחמים ומאפים", tag: "לחם", image: "images/cat_breads.jpg", gradient: "linear-gradient(135deg, #b45309 0%, #78350f 100%)" },
    { title: "תבשילים ועיקריות", tag: "תבשיל", image: "images/cat_mains.jpg", gradient: "linear-gradient(135deg, #dc2626 0%, #991b1b 100%)" },
    { title: "חטיפים ותוספות", tag: "חטיף", image: "images/cat_snacks.jpg", gradient: "linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)" },
    { title: "כל המתכונים", tag: "all", image: "images/cat_all.jpg", gradient: "linear-gradient(135deg, #2563eb 0%, #1e40af 100%)" }
];

// Register Service Worker immediately for offline PWA functionality
if ('serviceWorker' in navigator) {
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
            refreshing = true;
            window.location.reload();
        }
    });

    navigator.serviceWorker.register('sw.js')
        .then(reg => {
            console.log('ServiceWorker registered with scope:', reg.scope);
            reg.update().catch(() => {});
        })
        .catch(err => {
            console.warn('ServiceWorker registration error:', err);
        });
}

function setOfflineMode(isOffline) {
    const badge = document.getElementById('offlineStatusBadge');
    if (badge) {
        badge.style.display = isOffline ? 'inline-flex' : 'none';
    }
}

window.addEventListener('online', () => {
    setOfflineMode(false);
    fetchRecipes();
});

window.addEventListener('offline', () => {
    setOfflineMode(true);
});

function loadCachedRecipesSync() {
    // 1. Try embedded inline data in HTML (fastest, guaranteed 100% offline availability)
    try {
        const inlineEl = document.getElementById('initialRecipesData');
        if (inlineEl && inlineEl.textContent.trim()) {
            const parsed = JSON.parse(inlineEl.textContent);
            if (Array.isArray(parsed) && parsed.length > 0) {
                allRecipes = parsed;
            }
        }
    } catch (e) {
        console.warn('Error reading inline recipes:', e);
    }

    // 2. Try localStorage (which may have newer edits or user notes)
    try {
        const localData = localStorage.getItem(RECIPES_STORAGE_KEY);
        if (localData) {
            const parsed = JSON.parse(localData);
            if (Array.isArray(parsed) && parsed.length > 0) {
                allRecipes = parsed;
                return true;
            }
        }
    } catch (e) {
        console.warn('Error reading cached recipes from localStorage:', e);
    }
    return allRecipes.length > 0;
}

document.addEventListener('DOMContentLoaded', () => {
    // 1. ALWAYS render categories immediately on load (zero delay, never blank!)
    showCategories();

    // 2. Load recipes from localStorage synchronously
    const hasLocal = loadCachedRecipesSync();
    if (hasLocal) {
        setOfflineMode(!navigator.onLine);
    }

    // 3. Fetch fresh data in background (with multi-tier offline fallback)
    fetchRecipes();

    // Search input handler
    document.getElementById('searchInput').addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase().trim();
        if (!term) {
            showCategories();
            return;
        }
        const filtered = allRecipes.filter(r => 
            r.title.toLowerCase().includes(term) || 
            (r.tags && r.tags.some(t => t.toLowerCase().includes(term)))
        );
        renderGrid(filtered, `חיפוש: "${term}"`);
    });

    document.getElementById('backToCategoriesBtn').addEventListener('click', showCategories);

    // Modal Close and Navigation Handlers
    let isHistoryNavigating = false;

    window.addEventListener('popstate', () => {
        isHistoryNavigating = true;
        const recipeModal = document.getElementById('recipeModal');
        if (recipeModal) recipeModal.style.display = 'none';
        const addModal = document.getElementById('addRecipeModal');
        if (addModal) addModal.style.display = 'none';
        setTimeout(() => { isHistoryNavigating = false; }, 50);
    });

    window.closeRecipeModal = function() {
        const modal = document.getElementById('recipeModal');
        if (modal) {
            modal.style.display = 'none';
            if (!isHistoryNavigating && window.history.state && window.history.state.modal === 'recipe') {
                window.history.back();
            }
        }
    };

    window.closeAddModal = function() {
        const modal = document.getElementById('addRecipeModal');
        if (modal) {
            modal.style.display = 'none';
            if (!isHistoryNavigating && window.history.state && window.history.state.modal === 'add') {
                window.history.back();
            }
        }
    };

    function setupModalClose(modalId, triggerIds, closeFn) {
        const modal = document.getElementById(modalId);
        if (!modal) return;

        // Triggers (buttons, labels, footer buttons)
        triggerIds.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            
            const handleClose = (e) => {
                e.preventDefault();
                e.stopPropagation();
                closeFn();
            };

            el.addEventListener('click', handleClose);
            el.addEventListener('touchend', handleClose, { passive: false });
        });

        // Backdrop click & tap for iOS and desktop
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeFn();
            }
        });

        let touchStartY = 0;
        modal.addEventListener('touchstart', (e) => {
            if (e.target === modal && e.touches.length > 0) {
                touchStartY = e.touches[0].clientY;
            }
        }, { passive: true });

        modal.addEventListener('touchend', (e) => {
            if (e.target === modal && e.changedTouches.length > 0) {
                const diffY = Math.abs(e.changedTouches[0].clientY - touchStartY);
                if (diffY < 15) {
                    e.preventDefault();
                    closeFn();
                }
            }
        }, { passive: false });
    }

    setupModalClose('recipeModal', ['closeModal', 'closeModalGroup', 'closeModalText', 'closeModalFooterBtn'], window.closeRecipeModal);
    setupModalClose('addRecipeModal', ['closeAddModal', 'closeAddModalGroup', 'closeAddModalText'], window.closeAddModal);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            window.closeRecipeModal();
            window.closeAddModal();
        }
    });

    document.getElementById('floatingAddBtn').addEventListener('click', () => {
        const modal = document.getElementById('addRecipeModal');
        modal.style.display = 'block';
        const modalContent = modal.querySelector('.modal-content');
        if (modalContent) modalContent.scrollTop = 0;
        try {
            window.history.pushState({ modal: 'add' }, '');
        } catch (e) {}
    });

    document.getElementById('addNoteBtn').addEventListener('click', async () => {
        const textEl = document.getElementById('newNoteText');
        const text = textEl.value.trim();
        if (!text || !currentRecipe) return;
        
        const newNote = {
            text: text,
            date: new Date().toISOString()
        };
        
        const updatedNotes = [...(currentRecipe.notes || []), newNote];
        await updateNotes(updatedNotes);
        textEl.value = '';
    });

    // Add Ingredient Row
    document.getElementById('addIngredientBtn').addEventListener('click', () => {
        const div = document.createElement('div');
        div.className = 'ingredient-row';
        div.innerHTML = `
            <input type="text" placeholder="שם המצרך" class="ing-item" required>
            <input type="number" step="0.1" placeholder="כמות" class="ing-qty">
            <input type="text" placeholder="יחידת מידה" class="ing-unit">
            <button type="button" class="remove-ing-btn">&times;</button>
        `;
        document.getElementById('ingredientsInputs').appendChild(div);
        
        div.querySelector('.remove-ing-btn').addEventListener('click', () => {
            div.remove();
        });
    });

    // Initialize first remove button
    const firstRemoveBtn = document.querySelector('.remove-ing-btn');
    if (firstRemoveBtn) {
        firstRemoveBtn.addEventListener('click', function() {
            if(document.querySelectorAll('.ingredient-row').length > 1) {
                this.parentElement.remove();
            }
        });
    }

    // Delete Recipe
    document.getElementById('deleteRecipeBtn').addEventListener('click', async () => {
        if (!currentRecipe) return;
        
        if (navigator.onLine === false) {
            alert('לא ניתן למחוק מתכון כאשר המחשב כבוי או במצב אופליין.');
            return;
        }

        if (confirm(`האם אתה בטוח שברצונך למחוק את המתכון "${currentRecipe.title}"? פעולה זו בלתי הפיכה.`)) {
            try {
                const res = await fetch(`/api/recipes/${encodeURIComponent(currentRecipe.id)}`, {
                    method: 'DELETE'
                });
                if (res.ok) {
                    window.closeRecipeModal();
                    fetchRecipes();
                } else {
                    alert('שגיאה במחיקת המתכון.');
                }
            } catch (err) {
                console.error(err);
                alert('שגיאה במחיקת המתכון (וודא שהמחשב דולק ומחובר לרשת).');
            }
        }
    });

    // Add Recipe Form Submit
    document.getElementById('addRecipeForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        if (navigator.onLine === false) {
            alert('לא ניתן להוסיף מתכונים חדשים כשהמחשב כבוי. אנא חבר את המחשב לשרת תחילה.');
            return;
        }
        
        const ingRows = document.querySelectorAll('.ingredient-row');
        const ingredients = [];
        ingRows.forEach(row => {
            const item = row.querySelector('.ing-item').value.trim();
            const qty = row.querySelector('.ing-qty').value;
            const unit = row.querySelector('.ing-unit').value.trim();
            if (item) {
                ingredients.push({
                    item,
                    quantity: qty ? parseFloat(qty) : null,
                    unit: unit || null
                });
            }
        });

        const tagsStr = document.getElementById('addTags').value;
        const tags = tagsStr.split(',').map(t => t.trim()).filter(t => t);

        const newRecipe = {
            title: document.getElementById('addTitle').value.trim(),
            tags: tags,
            source_link: document.getElementById('addLink').value.trim() || null,
            image: document.getElementById('addImage').value.trim() || null,
            servings: parseInt(document.getElementById('addServings').value) || 1,
            ingredients: ingredients,
            body: document.getElementById('addBody').value.trim()
        };

        try {
            const res = await fetch('/api/recipes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newRecipe)
            });
            
            if (res.ok) {
                window.closeAddModal();
                document.getElementById('addRecipeForm').reset();
                fetchRecipes();
            } else {
                alert('שגיאה בשמירת המתכון.');
            }
        } catch (err) {
            console.error(err);
            alert('שגיאה בשמירת המתכון (וודא שהמחשב דולק ומחובר לרשת).');
        }
    });

    // Import URL Form Submit
    document.getElementById('importUrlForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        if (navigator.onLine === false) {
            alert('לא ניתן לייבא מתכונים כשהמחשב כבוי או ללא רשת.');
            return;
        }

        const urlInput = document.getElementById('importUrlInput').value.trim();
        if (!urlInput) return;

        const loader = document.getElementById('importLoader');
        const btn = document.getElementById('importUrlBtn');
        
        loader.style.display = 'block';
        btn.disabled = true;

        try {
            const res = await fetch('/api/import-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: urlInput })
            });
            
            if (res.ok) {
                window.closeAddModal();
                document.getElementById('importUrlForm').reset();
                fetchRecipes();
            } else {
                const errData = await res.json();
                alert('שגיאה בייבוא: ' + (errData.error || 'לא ידוע'));
            }
        } catch (err) {
            console.error(err);
            alert('שגיאה בייבוא המתכון (וודא שהמחשב דולק ומחובר לרשת).');
        } finally {
            loader.style.display = 'none';
            btn.disabled = false;
        }
    });
});

async function fetchRecipes() {
    let freshData = null;
    const isLocalBackend = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const apiUrl = isLocalBackend ? '/api/recipes' : `recipes.json?v=${Date.now()}`;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);
        const res = await fetch(apiUrl, { signal: controller.signal, cache: 'no-store' });
        clearTimeout(timeoutId);

        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
                freshData = data;
                allRecipes = freshData;
                try {
                    localStorage.setItem(RECIPES_STORAGE_KEY, JSON.stringify(freshData));
                } catch (e) {}
                setOfflineMode(false);
                precacheAllRecipeImages(freshData);
                return;
            }
        }
    } catch (err) {
        console.warn('Network unreachable or server offline, using cached recipes:', err);
        setOfflineMode(true);
        if (allRecipes.length === 0) {
            loadCachedRecipesSync();
        }
    }
}

async function precacheAllRecipeImages(recipes) {
    if (!('caches' in window)) return;
    try {
        const cache = await caches.open('recipes-images-v9');
        const imageUrls = new Set();
        CATEGORIES.forEach(c => {
            if (c.image) imageUrls.add(c.image);
        });
        recipes.forEach(r => {
            if (r.image) {
                const imgUrl = r.image.startsWith('http') ? r.image : `images/${r.image}`;
                imageUrls.add(imgUrl);
            }
        });

        for (const url of imageUrls) {
            try {
                const match = await cache.match(url);
                if (!match) {
                    const resp = await fetch(url).catch(() => null);
                    if (resp && (resp.ok || resp.type === 'opaque')) {
                        await cache.put(url, resp);
                    }
                }
            } catch (e) {}
        }
    } catch (e) {}
}

function showCategories() {
    document.getElementById('categoryGrid').style.display = 'grid';
    document.getElementById('recipeGrid').style.display = 'none';
    document.getElementById('recipeViewHeader').style.display = 'none';
    renderCategories();
}

function renderCategories() {
    const grid = document.getElementById('categoryGrid');
    grid.innerHTML = '';
    CATEGORIES.forEach(cat => {
        const card = document.createElement('div');
        card.className = 'category-card';
        card.style.background = cat.gradient;
        card.innerHTML = `
            <img src="${cat.image}" alt="${cat.title}" onerror="this.style.display='none'">
            <div class="category-overlay">
                <div class="category-title">${cat.title}</div>
            </div>
        `;
        card.addEventListener('click', () => {
            let filtered = allRecipes;
            if (cat.tag !== 'all') {
                filtered = allRecipes.filter(r => r.tags && r.tags.includes(cat.tag));
            }
            renderGrid(filtered, cat.title);
        });
        grid.appendChild(card);
    });
}

function renderGrid(recipes, title = "כל המתכונים") {
    document.getElementById('categoryGrid').style.display = 'none';
    document.getElementById('recipeViewHeader').style.display = 'flex';
    document.getElementById('recipeGrid').style.display = 'grid';
    document.getElementById('currentCategoryTitle').textContent = title;

    const grid = document.getElementById('recipeGrid');
    grid.innerHTML = '';
    
    if (!recipes || recipes.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'empty-state';
        emptyDiv.style.gridColumn = '1 / -1';
        emptyDiv.style.textAlign = 'center';
        emptyDiv.style.padding = '3.5rem 1.5rem';
        emptyDiv.style.background = 'rgba(30, 41, 59, 0.4)';
        emptyDiv.style.borderRadius = '1rem';
        emptyDiv.style.border = '1px solid rgba(255, 255, 255, 0.1)';
        
        emptyDiv.innerHTML = `
            <div style="font-size: 2.8rem; margin-bottom: 0.8rem;">🍲</div>
            <h3 style="margin-bottom: 0.5rem; color: #f8fafc; font-size: 1.3rem;">לא נמצאו מתכונים</h3>
            <p style="color: #94a3b8; font-size: 0.95rem; margin-bottom: 1.2rem;">
                ${allRecipes.length === 0 ? 'המחשב כבוי כרגע וטרם נשמרו מתכונים מקומית במכשיר זה.' : 'לא נמצאו מתכונים תחת קטגוריה זו.'}
            </p>
            <button class="submit-btn" onclick="showCategories()" style="width: auto; padding: 0.6rem 1.5rem;">חזור לקטגוריות</button>
        `;
        grid.appendChild(emptyDiv);
        return;
    }

    recipes.forEach(recipe => {
        const card = document.createElement('div');
        card.className = 'recipe-card';
        
        const imgHtml = recipe.image ? 
            `<img src="${recipe.image.startsWith('http') ? recipe.image : 'images/' + recipe.image}" style="width:100%; height:150px; object-fit:cover; border-radius:0.5rem; margin-bottom:1rem;" onerror="this.style.display='none'">` 
            : '';
            
        const tagsHtml = recipe.tags ? recipe.tags.map(t => `<span class="tag">${t}</span>`).join('') : '';
        const timeHtml = recipe.prep_time_minutes ? `<div style="font-size:0.8rem; color:var(--text-secondary, #94a3b8); margin:0.3rem 0;">⏱️ ${recipe.prep_time_minutes} דקות</div>` : '';
        
        card.innerHTML = `
            ${imgHtml}
            <div class="recipe-title">${recipe.title}</div>
            ${timeHtml}
            <div class="recipe-tags">${tagsHtml}</div>
        `;
        
        card.addEventListener('click', () => openRecipe(recipe));
        grid.appendChild(card);
    });
}

function openRecipe(recipe) {
    currentRecipe = recipe;
    currentScale = 1;
    
    document.getElementById('modalTitle').textContent = recipe.title;
    
    const imgEl = document.getElementById('modalImage');
    if (recipe.image) {
        imgEl.src = recipe.image.startsWith('http') ? recipe.image : 'images/' + recipe.image;
        imgEl.style.display = 'block';
        imgEl.onerror = () => { imgEl.style.display = 'none'; };
    } else {
        imgEl.style.display = 'none';
    }
    
    const prepEl = document.getElementById('modalPrepTime');
    if (recipe.prep_time_minutes) {
        prepEl.textContent = `⏱️ זמן הכנה: ${recipe.prep_time_minutes} דקות`;
    } else {
        prepEl.textContent = '';
    }
    
    const sourceEl = document.getElementById('modalSourceLink');
    if (recipe.source_link) {
        sourceEl.innerHTML = `<a href="${recipe.source_link}" target="_blank" style="color:#60a5fa; text-decoration:none;">מקור המתכון 🔗</a>`;
    } else {
        sourceEl.innerHTML = '';
    }
    
    if (typeof marked !== 'undefined') {
        document.getElementById('modalBody').innerHTML = marked.parse(recipe.body || '');
    } else {
        document.getElementById('modalBody').textContent = recipe.body || '';
    }
    
    renderScaler();
    renderIngredients();
    renderNotes();
    
    const recipeModal = document.getElementById('recipeModal');
    recipeModal.style.display = 'block';
    const modalContent = recipeModal.querySelector('.modal-content');
    if (modalContent) modalContent.scrollTop = 0;
    try {
        window.history.pushState({ modal: 'recipe' }, '');
    } catch (e) {}
}

function renderScaler() {
    const container = document.getElementById('scalerButtons');
    container.innerHTML = '';
    
    const scales = [
        { label: '1/3x', mult: 1/3 },
        { label: '1/2x', mult: 1/2 },
        { label: '1x', mult: 1 },
        { label: '1.5x', mult: 1.5 },
        { label: '2x', mult: 2 },
        { label: '3x', mult: 3 },
        { label: '4x', mult: 4 },
        { label: '5x', mult: 5 }
    ];
    
    scales.forEach(s => {
        const btn = document.createElement('button');
        btn.className = `scale-btn ${currentScale === s.mult ? 'active' : ''}`;
        btn.textContent = s.label;
        btn.addEventListener('click', () => {
            currentScale = s.mult;
            renderScaler();
            renderIngredients();
        });
        container.appendChild(btn);
    });
}

function renderIngredients() {
    const list = document.getElementById('modalIngredients');
    list.innerHTML = '';
    
    if (!currentRecipe.ingredients) return;
    
    const ratio = currentScale;
    
    currentRecipe.ingredients.forEach(ing => {
        const li = document.createElement('li');
        let text = ing.item;
        
        if (ing.quantity) {
            const scaledQty = (ing.quantity * ratio);
            const formattedQty = Number.isInteger(scaledQty) ? scaledQty : parseFloat(scaledQty.toFixed(2));
            const unitText = ing.unit ? ` ${ing.unit}` : '';
            text = `<span>${formattedQty}${unitText}</span> <span>${text}</span>`;
        } else {
            text = `<span></span> <span>${text}</span>`;
        }
        
        li.innerHTML = text;
        list.appendChild(li);
    });
}

function renderNotes() {
    const list = document.getElementById('modalNotes');
    list.innerHTML = '';
    if (!currentRecipe || !currentRecipe.notes) return;
    
    currentRecipe.notes.forEach((note, index) => {
        const li = document.createElement('li');
        li.className = 'note-item';
        li.style.marginBottom = '1rem';
        li.style.padding = '0.5rem';
        li.style.background = '#f9f9f9';
        li.style.borderRadius = '5px';
        li.style.color = '#1e293b';
        
        const dateStr = note.date ? new Date(note.date).toLocaleString('he-IL') : '';
        
        li.innerHTML = `
            <div style="font-size:0.8rem; color:#888; margin-bottom:0.2rem;">${dateStr}</div>
            <div class="note-text" style="white-space:pre-wrap;">${note.text}</div>
            <div style="margin-top:0.5rem;">
                <button class="edit-note-btn submit-btn" data-index="${index}" style="width:auto; padding:0.2rem 0.5rem; font-size:0.8rem; margin-left:0.5rem;">ערוך</button>
                <button class="delete-note-btn delete-btn" data-index="${index}" style="width:auto; padding:0.2rem 0.5rem; font-size:0.8rem;">מחק</button>
            </div>
        `;
        list.appendChild(li);
    });
    
    list.querySelectorAll('.delete-note-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = e.target.getAttribute('data-index');
            if (confirm('למחוק הערה זו?')) {
                const updatedNotes = [...currentRecipe.notes];
                updatedNotes.splice(idx, 1);
                updateNotes(updatedNotes);
            }
        });
    });
    
    list.querySelectorAll('.edit-note-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = e.target.getAttribute('data-index');
            const currentText = currentRecipe.notes[idx].text;
            const newText = prompt('ערוך הערה:', currentText);
            if (newText !== null && newText.trim() !== '') {
                const updatedNotes = [...currentRecipe.notes];
                updatedNotes[idx] = {
                    text: newText.trim(),
                    date: new Date().toISOString()
                };
                updateNotes(updatedNotes);
            }
        });
    });
}

async function updateNotes(newNotes) {
    try {
        const res = await fetch(`/api/recipes/${encodeURIComponent(currentRecipe.id)}/notes`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes: newNotes })
        });
        if (res.ok) {
            currentRecipe.notes = newNotes;
            renderNotes();
            fetchRecipes();
        } else {
            throw new Error('Server returned non-ok status');
        }
    } catch (err) {
        console.warn('Server unreachable, saving note locally in browser cache:', err);
        currentRecipe.notes = newNotes;
        renderNotes();
        try {
            const idx = allRecipes.findIndex(r => r.id === currentRecipe.id);
            if (idx !== -1) {
                allRecipes[idx].notes = newNotes;
                localStorage.setItem(RECIPES_STORAGE_KEY, JSON.stringify(allRecipes));
            }
            alert('ההערה נשמרה מקומית במכשיר שלך (המחשב כבוי כרגע).');
        } catch (e) {
            alert('שגיאה בשמירת ההערה.');
        }
    }
}
