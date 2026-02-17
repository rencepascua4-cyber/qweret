pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const pdfInput = document.getElementById('pdfInput');
const uploadZone = document.getElementById('uploadZone');
const fileMetaSection = document.getElementById('fileMetaSection');
const pdfPreviewArea = document.getElementById('pdfPreviewArea');
const textDisplayArea = document.getElementById('textDisplayArea');
const pageCountBadge = document.getElementById('pageCountBadge');
const fileTabsContainer = document.getElementById('fileTabsContainer');
const fileTabs = document.getElementById('fileTabs');
const contentTabsContainer = document.getElementById('contentTabsContainer');
const contentTabs = document.getElementById('contentTabs');
const clearAllBtn = document.getElementById('clearAllBtn');

const API_ENDPOINT = '/api/clean-pdf';
const MAX_FILE_SIZE = 50 * 1024 * 1024;

let pdfFiles = [];
let activePdfIndex = -1;
let extractedTexts = {};

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// SIMPLE file tabs update
function updateFileTabs() {
    if (pdfFiles.length === 0) {
        fileTabsContainer.style.display = 'none';
        contentTabsContainer.style.display = 'none';
        return;
    }
    
    fileTabsContainer.style.display = 'block';
    fileTabs.innerHTML = ''; // Clear
    
    for (let i = 0; i < pdfFiles.length; i++) {
        const file = pdfFiles[i];
        
        // Create tab div
        const tab = document.createElement('div');
        tab.className = 'file-tab';
        if (i === activePdfIndex) {
            tab.className += ' active';
        }
        tab.setAttribute('data-index', i);
        
        // Add content
        const icon = document.createElement('span');
        icon.className = 'tab-icon';
        icon.textContent = '📄';
        
        const name = document.createElement('span');
        name.className = 'tab-name';
        let displayName = file.name;
        if (displayName.length > 15) {
            displayName = displayName.substring(0, 12) + '…';
        }
        name.textContent = displayName;
        
        const size = document.createElement('span');
        size.className = 'tab-size';
        size.textContent = formatFileSize(file.size);
        
        const closeBtn = document.createElement('button');
        closeBtn.className = 'tab-close';
        closeBtn.textContent = '✕';
        closeBtn.onclick = function(e) {
            e.stopPropagation();
            removePdf(i);
        };
        
        tab.appendChild(icon);
        tab.appendChild(name);
        tab.appendChild(size);
        tab.appendChild(closeBtn);
        
        tab.onclick = function() {
            const idx = parseInt(this.getAttribute('data-index'));
            switchToPdf(idx);
        };
        
        fileTabs.appendChild(tab);
    }
}

// SIMPLE content tabs update
function updateContentTabs() {
    if (pdfFiles.length === 0) {
        contentTabsContainer.style.display = 'none';
        return;
    }
    
    contentTabsContainer.style.display = 'block';
    contentTabs.innerHTML = ''; // Clear
    
    for (let i = 0; i < pdfFiles.length; i++) {
        const file = pdfFiles[i];
        
        // Create tab div
        const tab = document.createElement('div');
        tab.className = 'content-tab';
        if (i === activePdfIndex) {
            tab.className += ' active';
        }
        tab.setAttribute('data-index', i);
        
        // Status icon
        const hasContent = extractedTexts[i] && extractedTexts[i].success;
        const statusIcon = document.createElement('span');
        statusIcon.className = 'tab-icon';
        statusIcon.textContent = hasContent ? '✅' : '⏳';
        
        // Name
        const name = document.createElement('span');
        name.className = 'tab-name';
        let displayName = file.name;
        if (displayName.length > 12) {
            displayName = displayName.substring(0, 10) + '…';
        }
        name.textContent = displayName;
        
        tab.appendChild(statusIcon);
        tab.appendChild(name);
        
        tab.onclick = function() {
            const idx = parseInt(this.getAttribute('data-index'));
            switchToPdf(idx);
        };
        
        contentTabs.appendChild(tab);
    }
}

async function switchToPdf(index) {
    if (index === activePdfIndex || index < 0 || index >= pdfFiles.length) return;
    
    activePdfIndex = index;
    const file = pdfFiles[index];
    
    updateFileTabs();
    updateContentTabs();
    
    fileMetaSection.innerHTML = '<div class="file-metadata">' +
        '<span style="font-size: 1.4rem;">📌</span>' +
        '<span style="font-weight: 600;">' + escapeHTML(file.name) + '</span>' +
        '<span>' + formatFileSize(file.size) + '</span>' +
        '</div>';
    
    pageCountBadge.innerText = 'loading…';
    pdfPreviewArea.innerHTML = '<div class="empty-preview-message"><span>🔄 Rendering preview...</span></div>';
    
    await renderPdfPreview(file);
    
    if (extractedTexts[index]) {
        displayExtractedText(index);
    } else {
        await extractTextViaAPI(file, index);
    }
}

function displayExtractedText(index) {
    const data = extractedTexts[index];
    if (!data) {
        textDisplayArea.innerHTML = '<div class="placeholder-text"><span>⏳ Processing...</span></div>';
        return;
    }
    
    if (data.success) {
        textDisplayArea.innerHTML = '<div style="white-space: pre-wrap; padding: 10px;">' + 
            escapeHTML(data.text || 'No text extracted') + '</div>';
        if (data.metadata && data.metadata.pages) {
            pageCountBadge.innerText = data.metadata.pages + ' page' + (data.metadata.pages > 1 ? 's' : '');
        } else {
            pageCountBadge.innerText = 'ready';
        }
    } else {
        textDisplayArea.innerHTML = '<div class="placeholder-text" style="color: #b34a4a;">' +
            '❌ Error: ' + escapeHTML(data.error || 'Unknown error') + '</div>';
        pageCountBadge.innerText = 'error';
    }
    updateContentTabs();
}

async function renderPdfPreview(file) {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const page = await pdf.getPage(1);
        
        const viewport = page.getViewport({ scale: 1.2 });
        const canvas = document.createElement('canvas');
        canvas.className = 'pdf-page-canvas';
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        await page.render({
            canvasContext: canvas.getContext('2d'),
            viewport: viewport
        }).promise;
        
        pdfPreviewArea.innerHTML = '';
        pdfPreviewArea.appendChild(canvas);
    } catch (error) {
        pdfPreviewArea.innerHTML = '<div class="empty-preview-message" style="color: #b33a3a;">' +
            '⚠️ Preview failed</div>';
    }
}

async function extractTextViaAPI(file, index) {
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        if (index === activePdfIndex) {
            textDisplayArea.innerHTML = '<div class="placeholder-text"><span>⏳ Extracting text...</span></div>';
        }
        
        const response = await fetch(API_ENDPOINT, { method: 'POST', body: formData });
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed');
        }
        
        extractedTexts[index] = { success: true, text: data.text, metadata: data.metadata };
        
        if (index === activePdfIndex) {
            displayExtractedText(index);
        } else {
            updateContentTabs();
        }
    } catch (error) {
        extractedTexts[index] = { success: false, error: error.message };
        if (index === activePdfIndex) {
            displayExtractedText(index);
        } else {
            updateContentTabs();
        }
    }
}

function removePdf(index) {
    if (index < 0 || index >= pdfFiles.length) return;
    
    pdfFiles.splice(index, 1);
    
    // Rebuild extractedTexts
    const newExtracted = {};
    for (let i = 0; i < pdfFiles.length; i++) {
        if (extractedTexts[i + (i >= index ? 1 : 0)]) {
            newExtracted[i] = extractedTexts[i + (i >= index ? 1 : 0)];
        }
    }
    extractedTexts = newExtracted;
    
    if (pdfFiles.length === 0) {
        activePdfIndex = -1;
        fileTabsContainer.style.display = 'none';
        contentTabsContainer.style.display = 'none';
        fileMetaSection.innerHTML = '';
        pdfPreviewArea.innerHTML = '<div class="empty-preview-message"><span>⏺ No PDF loaded — upload to preview</span></div>';
        textDisplayArea.innerHTML = '<div class="placeholder-text"><span>⬅ Upload a PDF to extract and display text</span></div>';
        pageCountBadge.innerText = 'ready';
    } else {
        if (activePdfIndex >= pdfFiles.length) {
            activePdfIndex = pdfFiles.length - 1;
        } else if (activePdfIndex > index) {
            activePdfIndex--;
        }
        updateFileTabs();
        updateContentTabs();
        switchToPdf(activePdfIndex);
    }
}

// Event Listeners
clearAllBtn.addEventListener('click', function() {
    pdfFiles = [];
    extractedTexts = {};
    activePdfIndex = -1;
    fileTabsContainer.style.display = 'none';
    contentTabsContainer.style.display = 'none';
    fileMetaSection.innerHTML = '';
    pdfPreviewArea.innerHTML = '<div class="empty-preview-message"><span>⏺ No PDF loaded — upload to preview</span></div>';
    textDisplayArea.innerHTML = '<div class="placeholder-text"><span>⬅ Upload a PDF to extract and display text</span></div>';
    pageCountBadge.innerText = 'ready';
    pdfInput.value = '';
});

pdfInput.addEventListener('change', function(e) {
    const files = Array.from(e.target.files).filter(f => f.type === 'application/pdf');
    if (files.length === 0) return;
    
    pdfFiles = pdfFiles.concat(files);
    
    if (activePdfIndex === -1) {
        activePdfIndex = 0;
    }
    
    updateFileTabs();
    updateContentTabs();
    switchToPdf(activePdfIndex);
});

uploadZone.addEventListener('click', function() {
    pdfInput.click();
});

uploadZone.addEventListener('dragover', function(e) {
    e.preventDefault();
    uploadZone.style.background = '#f2f8ff';
});

uploadZone.addEventListener('dragleave', function() {
    uploadZone.style.background = '#f9fcff';
});

uploadZone.addEventListener('drop', function(e) {
    e.preventDefault();
    uploadZone.style.background = '#f9fcff';
    
    const files = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf');
    if (files.length === 0) return;
    
    pdfFiles = pdfFiles.concat(files);
    
    if (activePdfIndex === -1) {
        activePdfIndex = 0;
    }
    
    updateFileTabs();
    updateContentTabs();
    switchToPdf(activePdfIndex);
});