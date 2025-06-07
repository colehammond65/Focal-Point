// Handles all admin image/category management JS for /admin/manage
// Includes: Dropzone upload, image preview, sortable image reordering, category panel toggles, alt text editing, bulk actions, and toast notifications.

document.addEventListener('DOMContentLoaded', function () {
    // --- Dropzone, Preview, and Upload ---
    var dropzone = document.getElementById('dropzone');
    var fileInput = document.getElementById('image');
    var preview = document.getElementById('preview');
    if (dropzone && fileInput) {
        dropzone.addEventListener('click', function () {
            fileInput.click();
        });
        dropzone.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInput.click();
            }
        });
        dropzone.addEventListener('dragover', function (e) {
            e.preventDefault();
            dropzone.classList.add('dragover');
        });
        dropzone.addEventListener('dragleave', function (e) {
            e.preventDefault();
            dropzone.classList.remove('dragover');
        });
        dropzone.addEventListener('drop', function (e) {
            e.preventDefault();
            dropzone.classList.remove('dragover');
            if (e.dataTransfer.files && e.dataTransfer.files.length) {
                fileInput.files = e.dataTransfer.files;
                fileInput.dispatchEvent(new Event('change'));
            }
        });
    }
    if (fileInput && preview) {
        fileInput.addEventListener('change', function () {
            preview.innerHTML = '';
            if (fileInput.files.length > 0) {
                Array.from(fileInput.files).forEach(function (file) {
                    if (file.type.startsWith('image/')) {
                        var reader = new FileReader();
                        reader.onload = function (e) {
                            var img = document.createElement('img');
                            img.src = e.target.result;
                            img.className = 'preview-thumb';
                            img.style.maxWidth = '80px';
                            img.style.maxHeight = '80px';
                            img.style.margin = '0.25em';
                            preview.appendChild(img);
                        };
                        reader.readAsDataURL(file);
                    }
                });
            }
        });
    }
    // --- SortableJS for image reordering ---
    if (!window.Sortable) {
        console.error('Sortable is NOT defined!');
    } else {
        console.log('Sortable is defined:', window.Sortable);
    }
    document.querySelectorAll('.image-grid').forEach(function (grid) {
        new Sortable(grid, {
            animation: 150,
            handle: '.img-item',
            draggable: '.img-item',
            onEnd: function (evt) {
                const catName = grid.getAttribute('data-cat');
                const order = Array.from(grid.querySelectorAll('.img-item')).map(div => div.dataset.filename);
                fetch('/admin/reorder-images', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ category: catName, order: JSON.stringify(order) })
                })
                    .then(res => res.ok ? res.json() : Promise.reject())
                    .then(() => {
                        const indicator = document.getElementById('saving-indicator');
                        if (indicator) {
                            indicator.textContent = 'Order saved!';
                            indicator.style.opacity = 1;
                            setTimeout(() => { indicator.style.opacity = 0; }, 1200);
                        }
                    })
                    .catch(() => {
                        const indicator = document.getElementById('saving-indicator');
                        if (indicator) {
                            indicator.textContent = 'Failed to save order!';
                            indicator.style.opacity = 1;
                            setTimeout(() => { indicator.style.opacity = 0; }, 2000);
                        }
                    });
            }
        });
    });
    // --- Category panel toggles ---
    function slugify(catName) {
        return catName.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
    }
    document.querySelectorAll('.category-toggle').forEach(function (toggle) {
        toggle.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                var catName = slugify(toggle.closest('.category-accordion').getAttribute('data-cat'));
                toggleCategoryPanel(catName);
            }
        });
        toggle.addEventListener('click', function () {
            var catName = slugify(toggle.closest('.category-accordion').getAttribute('data-cat'));
            toggleCategoryPanel(catName); // <-- Fix: actually toggle the panel on click
            // Reset bulk action buttons
            document.querySelectorAll('.category-accordion[data-cat="' + catName + '"] .img-item.selected')
                .forEach(function (img) { img.classList.remove('selected'); });
            var bulkDeleteBtn = document.getElementById('bulkDeleteBtn-' + catName);
            var setThumbBtn = document.getElementById('setThumbBtn-' + catName);
            var moveImagesBtn = document.getElementById('moveImagesBtn-' + catName);
            if (bulkDeleteBtn) bulkDeleteBtn.disabled = true;
            if (setThumbBtn) setThumbBtn.disabled = true;
            if (moveImagesBtn) moveImagesBtn.disabled = true;
        });
    });

    // --- Alt Text Save ---
    document.querySelectorAll('.alt-text-input').forEach(function (input) {
        let lastValue = input.value;
        function saveAltText() {
            const imageId = input.getAttribute('data-image-id');
            const altText = input.value.trim();
            if (!imageId || altText === lastValue) return;
            fetch('/admin/update-alt-text', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageId, altText })
            })
                .then(res => res.ok ? res.json() : Promise.reject())
                .then(data => {
                    lastValue = altText;
                    showToast('Alt text saved');
                })
                .catch(() => showToast('Failed to save alt text', 4000));
        }
        input.addEventListener('blur', saveAltText);
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                input.blur();
            }
        });
    });
});

// --- Toggle category panel ---
// Expands/collapses the category panel for a given category
function toggleCategoryPanel(catName) {
    var toggle = document.querySelector('.category-accordion[data-cat="' + catName + '"] .category-toggle');
    var panel = document.getElementById('cat-' + catName + '-panel');
    if (!toggle || !panel) return;
    var expanded = panel.classList.toggle('hidden');
    toggle.setAttribute('aria-expanded', !expanded);
    var arrow = toggle.querySelector('.accordion-arrow');
    if (arrow) arrow.style.transform = expanded ? '' : 'rotate(90deg)';
}

// --- Toggle selection for bulk image actions ---
// Selects/deselects an image for bulk actions
function toggleImageSelect(imgDiv) {
    imgDiv.classList.toggle('selected');
    var catName = imgDiv.closest('.category-accordion').getAttribute('data-cat');
    var selected = document.querySelectorAll('.category-accordion[data-cat="' + catName + '"] .img-item.selected');
    var bulkDeleteBtn = document.getElementById('bulkDeleteBtn-' + catName);
    var setThumbBtn = document.getElementById('setThumbBtn-' + catName);
    var moveImagesBtn = document.getElementById('moveImagesBtn-' + catName);
    if (bulkDeleteBtn) bulkDeleteBtn.disabled = selected.length === 0;
    if (setThumbBtn) setThumbBtn.disabled = selected.length !== 1;
    if (moveImagesBtn) moveImagesBtn.disabled = selected.length === 0;
}

// --- Bulk Delete ---
// Handles bulk deletion of selected images
function handleBulkDelete(event, catName) {
    event.preventDefault();
    var selected = document.querySelectorAll('.category-accordion[data-cat="' + catName + '"] .img-item.selected');
    if (selected.length === 0) return false;
    var filenames = Array.from(selected).map(imgDiv => imgDiv.dataset.filename);
    fetch('/admin/bulk-delete-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: catName, filenames })
    })
        .then(res => res.ok ? res.json() : Promise.reject())
        .then(data => {
            showToast('Deleted ' + filenames.length + ' image(s)');
            // Remove deleted images from DOM
            selected.forEach(imgDiv => imgDiv.remove());
            // If no images left in grid, show empty message
            var grid = document.querySelector('.category-accordion[data-cat="' + catName + '"] .image-grid');
            if (grid && grid.children.length === 0) {
                var emptyMsg = document.createElement('div');
                emptyMsg.className = 'empty-category-msg';
                emptyMsg.textContent = 'No images in this category.';
                grid.appendChild(emptyMsg);
            }
            // Disable buttons
            var bulkDeleteBtn = document.getElementById('bulkDeleteBtn-' + catName);
            var setThumbBtn = document.getElementById('setThumbBtn-' + catName);
            var moveImagesBtn = document.getElementById('moveImagesBtn-' + catName);
            if (bulkDeleteBtn) bulkDeleteBtn.disabled = true;
            if (setThumbBtn) setThumbBtn.disabled = true;
            if (moveImagesBtn) moveImagesBtn.disabled = true;
        })
        .catch(() => showToast('Failed to delete images', 4000));
    return false;
}

// --- Move Images ---
// Handles moving selected images to another category
function handleMoveImages(event, catName) {
    event.preventDefault();
    var form = event.target;
    var toCategory = form.querySelector('select[name="toCategory"]').value;
    var selected = document.querySelectorAll('.category-accordion[data-cat="' + catName + '"] .img-item.selected');
    if (selected.length === 0 || !toCategory) return false;
    var filenames = Array.from(selected).map(imgDiv => imgDiv.dataset.filename);
    fetch('/admin/move-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromCategory: catName, toCategory, filenames })
    })
        .then(res => res.ok ? res.json() : Promise.reject())
        .then(data => {
            showToast('Moved ' + filenames.length + ' image(s)');
            // Remove moved images from DOM (old category)
            selected.forEach(imgDiv => imgDiv.remove());
            // If no images left in grid, show empty message
            var grid = document.querySelector('.category-accordion[data-cat="' + catName + '"] .image-grid');
            if (grid && grid.children.length === 0) {
                var emptyMsg = document.createElement('div');
                emptyMsg.className = 'empty-category-msg';
                emptyMsg.textContent = 'No images in this category.';
                grid.appendChild(emptyMsg);
            }
            // Add moved images to new category's image grid
            var destGrid = document.querySelector('.category-accordion[data-cat="' + toCategory + '"] .image-grid');
            if (destGrid) {
                filenames.forEach(filename => {
                    // Create new image item (minimal, alt text blank, no id)
                    var imgDiv = document.createElement('div');
                    imgDiv.className = 'img-item bulk-select-img-item';
                    imgDiv.setAttribute('draggable', 'true');
                    imgDiv.setAttribute('data-filename', filename);
                    imgDiv.setAttribute('tabindex', '0');
                    imgDiv.onclick = function () { toggleImageSelect(imgDiv); };
                    imgDiv.onkeydown = function (event) {
                        if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); toggleImageSelect(imgDiv); }
                    };
                    var img = document.createElement('img');
                    img.src = '/images/' + toCategory + '/' + filename;
                    img.alt = '';
                    imgDiv.appendChild(img);
                    var input = document.createElement('input');
                    input.type = 'text';
                    input.className = 'alt-text-input ml-05';
                    input.value = '';
                    input.placeholder = 'Alt text';
                    input.setAttribute('aria-label', 'Edit alt text');
                    // No image-id available for moved image (unless you fetch it)
                    imgDiv.appendChild(input);
                    destGrid.appendChild(imgDiv);
                });
                // Remove empty message if present
                var emptyMsg = destGrid.querySelector('.empty-category-msg');
                if (emptyMsg) emptyMsg.remove();
            }
            // Reset select
            form.querySelector('select[name="toCategory"]').selectedIndex = 0;
            // Disable buttons
            var bulkDeleteBtn = document.getElementById('bulkDeleteBtn-' + catName);
            var setThumbBtn = document.getElementById('setThumbBtn-' + catName);
            var moveImagesBtn = document.getElementById('moveImagesBtn-' + catName);
            if (bulkDeleteBtn) bulkDeleteBtn.disabled = true;
            if (setThumbBtn) setThumbBtn.disabled = true;
            if (moveImagesBtn) moveImagesBtn.disabled = true;
        })
        .catch(() => showToast('Failed to move images', 4000));
    return false;
}

// --- Set as Thumbnail ---
// Sets the selected image as the category thumbnail
function handleSetThumbnail(catName) {
    var selected = document.querySelectorAll('.category-accordion[data-cat="' + catName + '"] .img-item.selected');
    if (selected.length !== 1) return;
    var filename = selected[0].dataset.filename;
    var form = document.createElement('form');
    form.method = 'POST';
    form.action = '/admin/set-thumbnail';
    var catInput = document.createElement('input');
    catInput.type = 'hidden';
    catInput.name = 'category';
    catInput.value = catName;
    form.appendChild(catInput);
    var fileInput = document.createElement('input');
    fileInput.type = 'hidden';
    fileInput.name = 'filename';
    fileInput.value = filename;
    form.appendChild(fileInput);
    document.body.appendChild(form);
    form.submit();
}

// --- Toast ---
// Displays a toast notification
function showToast(msg, timeout = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'toast-out 0.4s forwards';
        setTimeout(() => toast.remove(), 400);
    }, timeout);
}
