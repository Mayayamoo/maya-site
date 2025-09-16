'use strict';

// csv stuff for timeline
const now = new Date('2025-07-11');

function parseCSV(csv) {
    const lines = csv.trim().split(/\r?\n/);
    const headers = lines[0].split(',');
    return lines.slice(1).map(line => {
        const values = line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
        const obj = {};
        headers.forEach((h, i) => {
            let v = values[i] ? values[i].replace(/^"|"$/g, '').replace(/""/g, '"') : '';
            if (h === 'id') v = parseInt(v, 10);
            if (h === 'nodeOffset') v = parseFloat(v);
            obj[h] = v;
        });
        return obj;
    });
}

async function loadTimelineEventsFromCSV(path = 'timelinedata/timelineevents.csv') {
    const cacheKey = 'timeline_events_cache';
    const cacheTimestampKey = 'timeline_events_timestamp';
    const cacheExpiry = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    
    try {
        const cachedData = localStorage.getItem(cacheKey);
        const cachedTimestamp = localStorage.getItem(cacheTimestampKey);
        
        if (cachedData && cachedTimestamp) {
            const age = Date.now() - parseInt(cachedTimestamp);
            if (age < cacheExpiry) {
                return JSON.parse(cachedData);
            }
        }
    } catch (e) {
        console.warn('Cache read failed, fetching fresh data');
    }
    
    const res = await fetch(path);
    if (!res.ok) throw new Error('csv file broke');
    const csv = await res.text();
    const parsedData = parseCSV(csv);
    
    try {
        localStorage.setItem(cacheKey, JSON.stringify(parsedData));
        localStorage.setItem(cacheTimestampKey, Date.now().toString());
    } catch (e) {
        console.warn('Cache write failed, continuing without cache');
    }
    
    return parsedData;
}

let timelineEvents = [];
let currentActiveNodeIndex = -1;

function parseEventDate(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split('-');
    if (parts.length === 3) return new Date(parts[0], parts[1] - 1, parts[2]);
    if (parts.length === 2) return new Date(parts[0], parts[1] - 1, 1);
    if (parts.length === 1) return new Date(parts[0], 0, 1);
    return null;
}

function parseMonthName(monthStr) {
    if (!monthStr) return 0;
    const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    const idx = months.findIndex(m => monthStr.toLowerCase().startsWith(m));
    return idx >= 0 ? idx : 0;
}

function parseEventStartDate(dateStr) {
    if (!dateStr) return null;
    let start = dateStr.split(/\s*-\s*/)[0];
    let match = start.match(/([A-Za-z]+)[,]?\s*(\d{4})/);
    if (match) {
        const month = parseMonthName(match[1]);
        const year = parseInt(match[2], 10);
        return new Date(year, month, 1);
    }
    match = start.match(/(\d{4})/);
    if (match) {
        return new Date(parseInt(match[1], 10), 0, 1);
    }
    if (/current|present|now/i.test(dateStr)) {
        return new Date(now);
    }
    return null;
}

function computeTimelinePositions() {
    const dates = timelineEvents.map(e => e.realStartDate.getTime()).filter(t => !isNaN(t));
    if (dates.length === 0) {
        timelineEvents.forEach(event => event.position = 0.5);
        return;
    }
    const minDate = Math.min(...dates);
    const maxDate = Math.max(...dates);
    timelineEvents.forEach(event => {
        if (maxDate === minDate || isNaN(event.realStartDate.getTime())) {
            event.position = 0.5;
        } else {
            event.position = 1 - (event.realStartDate.getTime() - minDate) / (maxDate - minDate);
        }
    });
    timelineEvents.sort((a, b) => b.realStartDate - a.realStartDate);
}

function generatePath() {
    const isMobile = window.innerWidth <= 768;
    
    if (isMobile) {
        return "M200,0 C200,300 200,600 200,900 C200,1200 200,1500 200,1800 C200,2100 200,2400 200,2700 C200,3000 200,3300 200,3600";
    } else {
        return "M130,0 C180,100 230,200 330,300 C430,400 330,600 430,700 C530,800 430,1000 530,1100 C630,1200 730,1300 630,1400 C530,1500 630,1600 530,1700 C430,1800 530,1800 730,1800";    }
}

function updateSvgViewBox() {
    const container = document.querySelector('.timeline-container');
    const svg = document.querySelector('.timeline-svg');
    const isMobile = window.innerWidth <= 768;
    
    if (isMobile) {
        svg.setAttribute('viewBox', `0 0 400 3600`);
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        container.style.minHeight = '3600px';
    } else {
        svg.setAttribute('viewBox', `0 0 1000 1800`);
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        container.style.minHeight = '1800px';
    }
}

updateSvgViewBox();
window.addEventListener('load', updateSvgViewBox);

const timelinePath = document.getElementById('timeline-curve');
const timelineContainer = document.querySelector('.timeline-container');
const overlay = document.querySelector('.overlay');
const menuToggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('nav');

if (menuToggle && nav) {
    menuToggle.addEventListener('click', function() {
        nav.classList.toggle('active');
    });
}

function getPointAtPosition(path, position) {
    if (!path || typeof path.getTotalLength !== 'function' || path.getTotalLength() === 0) {
        return { x: 0, y: 0 };
    }
    const pathLength = path.getTotalLength();
    const point = path.getPointAtLength(pathLength * position);
    return { x: point.x, y: point.y };
}

function getAngleAtPosition(path, position) {
    if (!path || typeof path.getTotalLength !== 'function' || path.getTotalLength() === 0) {
        return 0;
    }
    const pathLength = path.getTotalLength();
    const p1 = path.getPointAtLength(Math.max(0, pathLength * position - 1));
    const p2 = path.getPointAtLength(Math.min(pathLength, pathLength * position + 1));
    return Math.atan2(p2.y - p1.y, p2.x - p1.x);
}

function animateConnectorLine(line) {
    if (!line || typeof line.getTotalLength !== 'function') return;
    const length = line.getTotalLength();
    line.style.strokeDasharray = length;
    line.style.strokeDashoffset = length;
    line.getBoundingClientRect();
    line.style.transition = 'stroke-dashoffset 1s cubic-bezier(0.77,0,0.18,1)';
    line.style.strokeDashoffset = '0';
}

function createConnector(dotPosition, nodeCenterX, nodeCenterY, color, isMobile) {
    const svg = document.querySelector('.timeline-svg');
    if (!svg) return;
    const connector = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    connector.classList.add('node-connector');
    connector.setAttribute('x1', dotPosition.x);
    connector.setAttribute('y1', dotPosition.y);
    connector.setAttribute('x2', nodeCenterX);
    connector.setAttribute('y2', nodeCenterY);
    connector.setAttribute('stroke', color || '#ff3264');
    connector.setAttribute('stroke-width', isMobile ? '1.5' : '2');
    svg.appendChild(connector);
    animateConnectorLine(connector);
}

function createTimelineDot(position) {
    const dotPosition = getPointAtPosition(timelinePath, position);
    const dot = document.createElement('div');
    dot.className = 'timeline-dot';
    dot.style.left = `${dotPosition.x}px`;
    dot.style.top = `${dotPosition.y}px`;
    timelineContainer.appendChild(dot);
    return dotPosition;
}

// timeline nav stuff

async function initTimeline() {
    try {
        initImageObserver();
        timelineEvents = await loadTimelineEventsFromCSV();
        timelineEvents.forEach(event => {
            if (typeof event.date === 'string') event.date = event.date.trim();
            event.realStartDate = parseEventStartDate(event.date) || new Date(now);
            if (event.description) {
                event.description = event.description.replace(/\\n|\r\\n/g, '<br>');
            }
        });
        computeTimelinePositions();
        renderTimelineTOC();
        createTimelineElements();
        
        if (window.innerWidth <= 768) {
            setupMobileTOC();
        }

        const loadingOverlay = document.getElementById('timeline-loading-overlay');
        if (loadingOverlay) {
            loadingOverlay.style.opacity = '0';
            setTimeout(() => { loadingOverlay.style.display = 'none'; }, 500);
        }
    } catch (e) {
        console.error('Error initializing timeline:', e);
        const loadingOverlay = document.getElementById('timeline-loading-overlay');
        if (loadingOverlay) {
            loadingOverlay.style.opacity = '0';
            setTimeout(() => { loadingOverlay.style.display = 'none'; }, 500);
        }
    }
}

function createTimelineElements() {
    if (!timelineContainer || !timelinePath) return;
    const isMobile = window.innerWidth <= 768;
    document.querySelectorAll('.timeline-dot, .timeline-node, .node-connector, .timeline-track, .timeline-entries').forEach(el => el.remove());

    if (isMobile) {
        // mobile bubbles
        createMobileTimelineBubbles();
    } else {
        // desktop stuff
        const nodeDiameter = 140;
        const svgWidth = 1400;
        const svgHeight = 1800;

        if (!timelinePath || typeof timelinePath.getTotalLength !== 'function' || timelinePath.getTotalLength() === 0) {
            console.error("Timeline curve not ready or not an SVG path for createTimelineElements.");
            return;
        }
        const minSpacing = 200;
        const baseOffsetDistance = 90; 
        const maxVerticalDeviation = 90;
        
        const sortedEvents = [...timelineEvents].sort((a, b) => {
            const posA = getPointAtPosition(timelinePath, a.position);
            const posB = getPointAtPosition(timelinePath, b.position);
            return posA.y - posB.y;
        });
        
        const placedNodes = [];
        
        sortedEvents.forEach((event, index) => {
            const dotPosition = getPointAtPosition(timelinePath, event.position);
            
            // Try to place node close to its timeline position first (PRIORITY #3)
            const isLeftSide = index % 2 === 0; // Alternate sides for better distribution
            
            // Start with ideal position close to timeline point
            const angle = getAngleAtPosition(timelinePath, event.position);
            let finalX = dotPosition.x + Math.cos(angle + Math.PI / 2) * (isLeftSide ? -baseOffsetDistance : baseOffsetDistance);
            let finalY = dotPosition.y;
            
            // PRIORITY #1: Ensure no overlaps - but be flexible about vertical positioning
            let attempts = 0;
            const maxAttempts = 10;
            
            while (attempts < maxAttempts) {
                let hasOverlap = false;
                
                for (const placed of placedNodes) {
                    const dx = finalX - placed.centerX;
                    const dy = finalY - placed.centerY;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    
                    if (distance < minSpacing) {
                        hasOverlap = true;
                        
                        // Gentle push with smaller steps
                        const pushDistance = 35; // Fixed small step size
                        const pushAngle = Math.atan2(dy, dx);
                        
                        // Gentle movements - prefer staying close to timeline
                        if (Math.abs(finalY + pushDistance - dotPosition.y) <= maxVerticalDeviation) {
                            finalY += pushDistance; // Small vertical step
                        } else {
                            // Small horizontal step
                            finalX += isLeftSide ? -pushDistance : pushDistance;
                        }
                        break;
                    }
                }
                
                if (!hasOverlap) break;
                attempts++;
            }
            
            // If still has overlap after attempts, use more aggressive positioning
            if (attempts >= maxAttempts) {
                // Find a clear spot by checking all placed nodes
                let clearY = dotPosition.y;
                let foundClear = false;
                
                for (let yOffset = 0; yOffset <= 300; yOffset += 30) {
                    for (let direction of [-1, 1]) {
                        const testY = dotPosition.y + (direction * yOffset);
                        let isClear = true;
                        
                        for (const placed of placedNodes) {
                            const dx = finalX - placed.centerX;
                            const dy = testY - placed.centerY;
                            const distance = Math.sqrt(dx * dx + dy * dy);
                            
                            if (distance < minSpacing) {
                                isClear = false;
                                break;
                            }
                        }
                        
                        if (isClear) {
                            finalY = testY;
                            foundClear = true;
                            break;
                        }
                    }
                    if (foundClear) break;
                }
            }
            
            // Keep within bounds
            finalX = Math.max(nodeDiameter / 2 + 10, Math.min(finalX, svgWidth - nodeDiameter / 2 - 10));
            finalY = Math.max(nodeDiameter / 2 + 10, Math.min(finalY, svgHeight - nodeDiameter / 2 - 10));
            
            placedNodes.push({ 
                centerX: finalX, 
                centerY: finalY,
                nodeX: finalX - nodeDiameter / 2, 
                nodeY: finalY - nodeDiameter / 2, 
                event, 
                dotPosition: getPointAtPosition(timelinePath, event.position)
            });
        });

        placedNodes.forEach(({ nodeX, nodeY, event, dotPosition }, index) => {
            // Create timeline dot
            const dot = document.createElement('div');
            dot.className = 'timeline-dot';
            dot.style.left = `${dotPosition.x}px`;
            dot.style.top = `${dotPosition.y}px`;
            timelineContainer.appendChild(dot);

            const node = document.createElement('div');
            node.className = 'timeline-node';
            node.style.left = `${nodeX}px`;
            node.style.top = `${nodeY}px`;
            node.style.width = `${nodeDiameter}px`;
            node.style.height = `${nodeDiameter}px`;
            node.dataset.index = index;
            node.dataset.id = event.id;
            node.tabIndex = 0;
            node.setAttribute('role', 'button');
            node.setAttribute('aria-label', `${event.title}, ${event.date}`);
            if (event.color) {
                node.style.borderColor = event.color;
            }

            const placeholderSize = 140;
            const imageSrc = event.image || `https://via.placeholder.com/${placeholderSize}/000000/FFFFFF?text=No+Image`;
            node.innerHTML = `
                <div class="node-image">
                    <img data-src="${imageSrc}" alt="${event.title}" class="lazy-load" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${placeholderSize}' height='${placeholderSize}'%3E%3Crect width='100%25' height='100%25' fill='%23333'/%3E%3C/svg%3E">
                    <div class="node-icon" style="background-color: ${event.color || '#ff3264'}">
                        <i class="${event.icon || 'fas fa-star'}"></i>
                    </div>
                </div>
                <div class="node-text-overlay">
                    <div class="node-title">${event.title}</div>
                    <div class="node-date">${event.date}</div>
                </div>
                <div class="node-pulse" style="border-color: ${event.color || '#ff3264'}"></div>
            `;
            
            setupLazyLoading(node.querySelector('.lazy-load'));
            timelineContainer.appendChild(node);
            createConnector(dotPosition, nodeX + nodeDiameter / 2, nodeY + nodeDiameter / 2, event.color, false);

            const summaryCard = document.createElement('div');
            summaryCard.className = 'timeline-summary-card';
            summaryCard.innerHTML = `
                <strong>${event.title}</strong><br>
                <span>${event.company || ''}</span><br>
                <span style='font-size:0.9em;color:#aaa;'>${event.date}</span><br>
                <button class='summary-view-btn' tabindex='-1'>View Details</button>
            `;
            summaryCard.style.display = 'none'; // Initially hidden
            node.appendChild(summaryCard);

            node.addEventListener('mouseenter', () => { summaryCard.style.display = 'block'; });
            node.addEventListener('mouseleave', () => { summaryCard.style.display = 'none'; });
            node.addEventListener('focus', () => { summaryCard.style.display = 'block'; });
            node.addEventListener('blur', (e) => { 
                // Don't hide if focus moves to the button inside summary
                if (!summaryCard.contains(e.relatedTarget)) {
                    summaryCard.style.display = 'none';
                }
            });
            summaryCard.querySelector('.summary-view-btn').addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent node click
                showTimelineDetailByIndex(index);
            });
            summaryCard.querySelector('.summary-view-btn').addEventListener('blur', (e) => {
                // If focus moves out of summary card entirely (and not to the node itself)
                if (!summaryCard.contains(e.relatedTarget) && e.relatedTarget !== node) {
                     summaryCard.style.display = 'none';
                }
            });


            node.addEventListener('click', () => {
                showTimelineDetailByIndex(index);
                updateTocActiveState(event.id);
            });
            node.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    showTimelineDetailByIndex(index);
                    updateTocActiveState(event.id);
                }
            });
        });
        
        setupTimelineNavigation();
        if (document.getElementById('path-particle')) {
            initPathParticle();
        }
    }
}

function createMobileTimelineBubbles() {
    document.querySelectorAll('.mobile-filter-bar, .mobile-timeline-track, .mobile-timeline-entries, .mobile-timeline-wrapper').forEach(el => el.remove());
    
    const wrapper = document.createElement('div');
    wrapper.className = 'mobile-timeline-wrapper';
    
    const filterBar = document.createElement('div');
    filterBar.className = 'mobile-filter-bar';
    
    const filterCategories = [
        { id: 'all', name: 'All', icon: 'fas fa-globe', color: '#ffffff' },
        { id: 'Work', name: 'Work', icon: 'fas fa-briefcase', color: '#d17aff' },
        { id: 'Progress Libs', name: 'Progress Libs', icon: 'fas fa-star', color: '#ff3264' },
        { id: 'Experience', name: 'Experience', icon: 'fas fa-graduation-cap', color: '#50dd90' },
        { id: 'Personal', name: 'Personal', icon: 'fas fa-user', color: '#ff7a7a' }
    ];
    
    filterCategories.forEach(category => {
        const button = document.createElement('button');
        button.className = 'mobile-filter-btn' + (category.id === 'all' ? ' active' : '');
        button.setAttribute('data-filter', category.id);
        button.innerHTML = `<i class="${category.icon}"></i> ${category.name}`;
        
        if (category.id === 'all') {
            button.classList.add('active');
        } else {
            const colorRgb = hexToRgb(category.color);
            button.style.setProperty('--filter-color', category.color);
            button.style.setProperty('--filter-color-rgb', colorRgb);
        }
        
        button.addEventListener('click', () => {
            document.querySelectorAll('.mobile-filter-btn').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            filterMobileEntries(category.id);
        });
        
        filterBar.appendChild(button);
    });
    
    const track = document.createElement('div');
    track.className = 'mobile-timeline-track';
    
    const entriesContainer = document.createElement('div');
    entriesContainer.className = 'mobile-timeline-entries';
    
    timelineEvents.forEach((event, index) => {
        const entry = document.createElement('div');
        entry.className = 'mobile-timeline-entry';
        
        const category = getCategoryFromIcon(event.icon);
        entry.dataset.category = category;
        entry.dataset.index = index;
        
        if (event.color) {
            entry.style.borderLeftColor = event.color;
            entry.style.setProperty('--entry-color', event.color);
        }
        
        const truncatedDescription = event.description ? 
            event.description.split('\n')[0].split('.')[0] + (event.description.length > event.description.split('\n')[0].split('.')[0].length ? '...' : '') 
            : '';
        
        entry.innerHTML = `
            <div class="mobile-entry-date">${event.date}</div>
            <div class="mobile-entry-title">${event.title}</div>
            <div class="mobile-entry-company">${event.company || ''}</div>
            <div class="mobile-entry-description">${truncatedDescription}</div>
            <button class="mobile-entry-button" data-index="${index}">View Details</button>
        `;
        
        entry.querySelector('.mobile-entry-button').addEventListener('click', () => {
            showTimelineDetailByIndex(index);
            updateTocActiveState(event.id);
        });
        
        
        entriesContainer.appendChild(entry);
    });
    
    wrapper.appendChild(filterBar);
    wrapper.appendChild(track);
    wrapper.appendChild(entriesContainer);
    timelineContainer.appendChild(wrapper);
    
    const navWrapper = document.querySelector('.timeline-navigation');
    if (navWrapper) navWrapper.style.display = 'none';
}

function filterMobileEntries(filter) {
    const entries = document.querySelectorAll('.mobile-timeline-entry');
    
    entries.forEach(entry => {
        if (filter === 'all') {
            entry.style.display = 'block';
        } else {
            const entryCategory = entry.dataset.category;
            if (filter === entryCategory) {
                entry.style.display = 'block';
            } else {
                entry.style.display = 'none';
            }
        }
    });
}

// Fix the detail view function - ensure overlay click works properly
function showTimelineDetailByIndex(index) {
    if (index < 0 || index >= timelineEvents.length) return;
    currentActiveNodeIndex = index;
    const event = timelineEvents[index];
    updateTocActiveState(event.id);

    const existingDetail = document.querySelector('.timeline-detail');
    if (existingDetail) existingDetail.remove();

    const detail = document.createElement('div');
    detail.className = 'timeline-detail';
    
    // Restructured detail layout without close button
    detail.innerHTML = `
        <div class="detail-header" style="border-color: ${event.color || '#ff3264'}">
            <div class="detail-header-compact">
                <div class="header-left">
                    <div class="detail-icon" style="background-color: ${event.color || '#ff3264'}">
                        <i class="${event.icon || 'fas fa-star'}"></i>
                    </div>
                </div>
                <div class="header-right">
                    <div class="detail-meta">
                        <span class="detail-date">${event.date}</span>
                        <div class="detail-sub">${event.company || ''}</div>
                    </div>
                </div>
            </div>
            <h2 class="detail-title">${event.title}</h2>
        </div>
        <div class="detail-content">
            <div class="detail-image-container">
                <img src="${event.image || 'https://via.placeholder.com/300/000000/FFFFFF?text=No+Image'}" alt="${event.title}" class="detail-image" style="border-color: ${event.color || '#ff3264'}" onerror="this.src='https://via.placeholder.com/300/000000/FFFFFF?text=Error'; this.onerror=null;">
            </div>
            <div class="detail-text">
                <p class="detail-description">${event.description || 'No description available.'}</p>
            </div>
        </div>
        <div class="detail-nav">
            <button class="detail-nav-btn prev-event"><i class="fas fa-chevron-left"></i> Previous</button>
            <button class="detail-nav-btn next-event">Next <i class="fas fa-chevron-right"></i></button>
        </div>
    `;
    document.body.appendChild(detail);
    
    // Add active class with slight delay for smoother animation
    setTimeout(() => {
        detail.classList.add('active');
        if (overlay) overlay.classList.add('active');
        document.querySelectorAll('.timeline-node').forEach((n, i) => n.classList.toggle('active', i === index));
    }, 10);

    // Remove previous event listeners to avoid duplicates and memory leaks
    if (overlay) {
        overlay.removeEventListener('click', closeDetail);
        overlay.addEventListener('click', closeDetail);
    }
    
    // Prevent clicks inside the detail view from closing it
    detail.addEventListener('click', (e) => {
        e.stopPropagation();
    });
    
    // Improve navigation by filtering out hidden events
    detail.querySelector('.prev-event').addEventListener('click', () => {
        // Find previous visible event
        let prevIndex = index - 1;
        while (prevIndex >= 0) {
            const prevEntry = document.querySelector(`.timeline-entry[data-index="${prevIndex}"]`);
            if (!prevEntry || !prevEntry.classList.contains('hidden-by-filter')) {
                break;
            }
            prevIndex--;
        }
        
        if (prevIndex >= 0) {
            showTimelineDetailByIndex(prevIndex);
        }
    });
    
    detail.querySelector('.next-event').addEventListener('click', () => {
        // Find next visible event
        let nextIndex = index + 1;
        while (nextIndex < timelineEvents.length) {
            const nextEntry = document.querySelector(`.timeline-entry[data-index="${nextIndex}"]`);
            if (!nextEntry || !nextEntry.classList.contains('hidden-by-filter')) {
                break;
            }
            nextIndex++;
        }
        
        if (nextIndex < timelineEvents.length) {
            showTimelineDetailByIndex(nextIndex);
        }
    });
    
    detail.tabIndex = -1; // Make it focusable
    detail.focus(); // Focus the detail view for keyboard nav
    detail.addEventListener('keydown', function(e) {
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            detail.querySelector('.prev-event').click();
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            detail.querySelector('.next-event').click();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            closeDetail();
        }
    });
}

// Update closeDetail function to properly handle overlay
function closeDetail() {
    const detail = document.querySelector('.timeline-detail');
    if (detail) {
        detail.classList.remove('active');
        if (overlay) overlay.classList.remove('active');
        document.querySelectorAll('.timeline-node.active').forEach(n => n.classList.remove('active'));
        setTimeout(() => {
            if (detail.parentNode) detail.parentNode.removeChild(detail);
            const activeNode = document.querySelector(`.timeline-node[data-index='${currentActiveNodeIndex}']`);
            if (activeNode) activeNode.focus(); // Return focus
        }, 400); // Match CSS transition
    }
}

// --- Timeline Table of Contents ---
function renderTimelineTOC() {
    const tocContainer = document.querySelector('.timeline-toc-content');
    if (!tocContainer) return;
    
    // Group events by category based on icon field
    const categoryMap = {};
    timelineEvents.forEach(event => {
        // Use icon field to determine category
        const category = getIconCategory(event.icon);
        if (!categoryMap[category]) {
            categoryMap[category] = {
                name: category,
                icon: event.icon,
                color: event.color,
                events: []
            };
        }
        categoryMap[category].events.push(event);
    });
    
    // Generate HTML for categories and items
    let html = '';
    
    // Get sorted categories (custom order for important categories)
    const sortedCategories = getSortedCategories(categoryMap);
    
    sortedCategories.forEach(category => {
        const categoryData = categoryMap[category];
        if (categoryData.events.length === 0) return;
        
        html += `
            <div class="timeline-toc-category">
                <div class="timeline-toc-category-header">
                    <i class="${categoryData.icon}" style="color: ${categoryData.color}"></i>
                    ${categoryData.name}
                </div>
                <div class="timeline-toc-items" style="border-left: 3px solid ${categoryData.color}">`;
                
        // Sort events within category by date (most recent first)
        categoryData.events
            .sort((a, b) => b.realStartDate - a.realStartDate)
            .forEach(event => {
                const dateStr = formatTocDate(event.realStartDate);
                html += `
                    <div class="timeline-toc-item" data-id="${event.id}" style="--item-color: ${event.color}; --item-color-rgb: ${hexToRgb(event.color)}">
                        <div class="timeline-toc-progress"></div>
                        ${event.title}
                        <span class="timeline-toc-date">${dateStr}</span>
                    </div>`;
            });
            
        html += `
                </div>
            </div>`;
    });
    
    tocContainer.innerHTML = html;
    
    // Add click handlers for TOC items
    tocContainer.querySelectorAll('.timeline-toc-item').forEach(item => {
        item.addEventListener('click', function() {
            const id = parseInt(this.getAttribute('data-id'), 10);
            navigateToTimelineItem(id);
        });
    });
    
    // Add toggle functionality for TOC
    const tocToggle = document.querySelector('.timeline-toc-toggle');
    const tocElement = document.querySelector('.timeline-toc');
    
    if (tocToggle && tocElement) {
        tocToggle.addEventListener('click', function() {
            tocElement.classList.toggle('timeline-toc-minimize');
            this.querySelector('i').classList.toggle('fa-chevron-up');
            this.querySelector('i').classList.toggle('fa-chevron-down');
        });
    }
}


// Navigate to a specific timeline item by ID
function navigateToTimelineItem(id) {
    const itemIndex = timelineEvents.findIndex(event => event.id === id);
    if (itemIndex >= 0) {
        showTimelineDetailByIndex(itemIndex); // This will set currentActiveNodeIndex and update TOC
        const node = document.querySelector(`.timeline-node[data-id='${id}']`);
        if (node) {
            node.scrollIntoView({ behavior: 'smooth', block: 'center' });
            node.classList.add('pulse-focus');
            setTimeout(() => node.classList.remove('pulse-focus'), 1500);
            node.focus();
        }
        // updateProgressBar(); // Called within showTimelineDetailByIndex if needed
    }
}

// Update active state in TOC based on current node
function updateTocActiveState(id) {
    document.querySelectorAll('.timeline-toc-item').forEach(item => {
        item.classList.toggle('active', parseInt(item.getAttribute('data-id')) === id);
        if (item.classList.contains('active')) {
            item.style.borderLeftColor = item.style.getPropertyValue('--item-color'); // Keep color on active
            // Scroll into view if not visible
            const tocContent = document.querySelector('.timeline-toc-content');
            if (tocContent && tocContent.scrollHeight > tocContent.clientHeight) {
                 const itemRect = item.getBoundingClientRect();
                 const tocRect = tocContent.getBoundingClientRect();
                 if (itemRect.top < tocRect.top || itemRect.bottom > tocRect.bottom) {
                    item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                 }
            }
        } else {
            item.style.borderLeftColor = 'transparent'; // Reset border for non-active
        }
    });
}

function getIconCategory(icon) { // Map icon to category name
    const iconCategories = {
        'fas fa-suitcase': 'Professional',
        'fas fa-star': 'Progress Libs',
        'fas fa-cogs': 'Advocacy & Organizing',
        'fas fa-user-alt': 'Personal'
    };
    return iconCategories[icon] || 'Other';
}

function getCategoryFromIcon(icon) {
    const iconToCategory = {
        'fas fa-suitcase': 'Work',
        'fas fa-star': 'Progress Libs',
        'fas fa-cogs': 'Experience',
        'fas fa-user-alt': 'Personal'
    };
    return iconToCategory[icon] || 'Other';
}

function getCategoryIcon(categoryName) { // Based on CSV 'branch'
    const icons = {
        'Work': 'fas fa-suitcase',
        'Experiences': 'fas fa-cogs', // Default from old, might need update
        'Personal Projects': 'fas fa-user-alt', // Default from old
        'Highlights': 'fas fa-star', // Default from old
        // Add more mappings from your CSV's 'branch' values to icons
        'Politics': 'fas fa-landmark',
        'Advocacy': 'fas fa-bullhorn',
        'Research': 'fas fa-microscope',
        'Technology': 'fas fa-laptop-code',
        'Creative': 'fas fa-paint-brush',
        'Media': 'fas fa-photo-video',
        'Writing': 'fas fa-pen-fancy',
        'Education': 'fas fa-graduation-cap',
    };
    return icons[categoryName] || 'fas fa-atom'; // A generic fallback
}

function getCategoryColor(categoryName, fallbackColor = '#cccccc') { // Based on CSV 'branch'
    const colors = { // Prefer colors from events if available, these are fallbacks
        'Work': '#d17aff',
        'Experiences': '#50dd90',
        'Personal Projects': '#ff7a7a',
        'Highlights': '#ff3264',
        'Politics': '#8a2be2', // Example: BlueViolet
        'Advocacy': '#3cb371', // Example: MediumSeaGreen
        'Technology': '#1e90ff', // Example: DodgerBlue
        'Education': '#ffa500', // Example: Orange
    };
    // Attempt to find a color from an event in that category first
    const eventInCat = timelineEvents.find(e => e.branch === categoryName && e.color);
    return eventInCat ? eventInCat.color : (colors[categoryName] || fallbackColor);
}

function getSortedCategories(categoryMap) {
    const priorityOrder = ['Progress Libs', 'Professional', 'Advocacy & Organizing', 'Personal'];
    const allCategories = Object.keys(categoryMap);
    return allCategories.sort((a, b) => {
        const aIndex = priorityOrder.indexOf(a);
        const bIndex = priorityOrder.indexOf(b);
        if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex;
        if (aIndex >= 0) return -1;
        if (bIndex >= 0) return 1;
        return a.localeCompare(b);
    });
}

function formatTocDate(date) {
    if (!date || isNaN(date.getTime())) return '';
    const currentYear = new Date().getFullYear();
    return date.getFullYear() === currentYear ? date.toLocaleDateString('en-US', { month: 'short' }) : date.getFullYear().toString();
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '255, 255, 255';
}

// Responsive Timeline Handling
function handleResponsiveTimeline() {
    const isMobile = window.innerWidth <= 768;
    if (!timelineContainer || !document.querySelector('.timeline-svg')) return;

    // Regenerate the path for the current viewport
    if (timelinePath) {
        const pathData = generatePath();
        timelinePath.setAttribute('d', pathData);
    }

    // Update SVG dimensions
    updateSvgViewBox();

    const hasMobileWrapper = document.querySelector('.mobile-timeline-wrapper');
    
    if (isMobile && !hasMobileWrapper) {
        timelineContainer.style.marginTop = '0';
        timelineContainer.style.paddingTop = '0';
        
        if (document.querySelector('.timeline-svg')) {
            document.querySelector('.timeline-svg').style.height = 'auto';
        }
        
        if (timelineEvents && timelineEvents.length > 0) {
            createTimelineElements();
        }
        setupMobileTOC();
    } else if (!isMobile && hasMobileWrapper) {
        document.querySelectorAll('.mobile-timeline-wrapper, .mobile-toc-fab').forEach(el => el.remove());
        
        if (timelineEvents && timelineEvents.length > 0) {
            createTimelineElements();
        }
    }
}

window.addEventListener('load', () => {
    if (timelinePath) {
        const pathData = generatePath();
        timelinePath.setAttribute('d', pathData);
        initTimeline().catch(err => console.error("Error during initial timeline load sequence:", err));
    } else {
        console.error("timelinePathElement (timeline-curve) not found on load.");
         const loadingOverlay = document.getElementById('timeline-loading-overlay');
        if (loadingOverlay) { // Still hide loading on critical error
            loadingOverlay.style.opacity = '0';
            setTimeout(() => { loadingOverlay.style.display = 'none'; }, 500);
        }
    }
});

let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(handleResponsiveTimeline, 250);
});

function minDistanceToPath(x, y, path, steps = 12) {
    if (!path || typeof path.getTotalLength !== 'function' || path.getTotalLength() === 0) return Infinity;
    let minDistSq = Infinity;
    const pathLength = path.getTotalLength();
    for (let i = 0; i <= steps; i++) {
        const point = path.getPointAtLength(pathLength * i / steps);
        const dx = point.x - x;
        const dy = point.y - y;
        minDistSq = Math.min(minDistSq, dx * dx + dy * dy);
    }
    return Math.sqrt(minDistSq);
}

function setupMobileTOC() {
    const existingFab = document.querySelector('.mobile-toc-fab');
    if (existingFab) existingFab.remove();
    
    const fab = document.createElement('button');
    fab.className = 'mobile-toc-fab';
    fab.innerHTML = '<i class="fas fa-list"></i>';
    fab.setAttribute('aria-label', 'Toggle table of contents');
    
    const toc = document.querySelector('.timeline-toc');
    let isVisible = false;
    
    fab.addEventListener('click', () => {
        if (isVisible) {
            toc.classList.remove('mobile-visible');
            fab.classList.remove('active');
            fab.innerHTML = '<i class="fas fa-list"></i>';
        } else {
            toc.classList.add('mobile-visible');
            fab.classList.add('active');
            fab.innerHTML = '<i class="fas fa-times"></i>';
        }
        isVisible = !isVisible;
    });
    
    if (toc) {
        const tocToggle = toc.querySelector('.timeline-toc-toggle');
        if (tocToggle) {
            tocToggle.addEventListener('click', () => {
                toc.classList.remove('mobile-visible');
                fab.classList.remove('active');
                fab.innerHTML = '<i class="fas fa-list"></i>';
                isVisible = false;
            });
        }
        
        toc.addEventListener('click', (e) => {
            if (e.target.classList.contains('timeline-toc-item')) {
                toc.classList.remove('mobile-visible');
                fab.classList.remove('active');
                fab.innerHTML = '<i class="fas fa-list"></i>';
                isVisible = false;
            }
        });
    }
    
    document.body.appendChild(fab);
}

let imageObserver;
function initImageObserver() {
    if ('IntersectionObserver' in window) {
        imageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    const src = img.getAttribute('data-src');
                    if (src) {
                        img.src = src;
                        img.classList.add('loaded');
                        img.removeAttribute('data-src');
                        img.onerror = function() {
                            this.src = this.src.replace(/\/[^\/]*$/, '/error-placeholder.svg');
                            this.onerror = null;
                        };
                    }
                    observer.unobserve(img);
                }
            });
        }, {
            rootMargin: '50px 0px',
            threshold: 0.01
        });
    }
}

function setupLazyLoading(img) {
    if (imageObserver && img) {
        imageObserver.observe(img);
    } else {
        const src = img.getAttribute('data-src');
        if (src) {
            img.src = src;
            img.removeAttribute('data-src');
        }
    }
}
