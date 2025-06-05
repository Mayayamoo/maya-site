'use strict';

// --- CSV Import for Timeline Events ---
// Usage: place timelineEvents.csv in the same directory as work.js or adjust the path below.
// CSV columns: id,title,company,date,nodeOffset,description,image,icon,color,branch

const now = new Date('2025-04-21');

function parseCSV(csv) {
    const lines = csv.trim().split(/\r?\n/);
    const headers = lines[0].split(',');
    return lines.slice(1).map(line => {
        const values = line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/); // Handles quoted commas
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
    const res = await fetch(path);
    if (!res.ok) throw new Error('Failed to load timelineEvents.csv');
    const csv = await res.text();
    return parseCSV(csv);
}

// Replace the static timelineEvents array with dynamic loading
let timelineEvents = [];
let currentActiveNodeIndex = -1;

// Helper: parse date string to Date object (YYYY, YYYY-MM, or YYYY-MM-DD)
function parseEventDate(dateStr) {
    if (!dateStr) return null;
    // Try to parse as YYYY-MM-DD, YYYY-MM, or YYYY
    const parts = dateStr.split('-');
    if (parts.length === 3) return new Date(parts[0], parts[1] - 1, parts[2]);
    if (parts.length === 2) return new Date(parts[0], parts[1] - 1, 1);
    if (parts.length === 1) return new Date(parts[0], 0, 1);
    return null;
}

// Helper: parse month name to number (0-11)
function parseMonthName(monthStr) {
    if (!monthStr) return 0;
    const months = [
        'january', 'february', 'march', 'april', 'may', 'june',
        'july', 'august', 'september', 'october', 'november', 'december'
    ];
    const idx = months.findIndex(m => monthStr.toLowerCase().startsWith(m));
    return idx >= 0 ? idx : 0;
}

// Helper: parse date string with month names and ranges
function parseEventStartDate(dateStr) {
    if (!dateStr) return null;
    // Handle ranges: split on ' - '
    let start = dateStr.split(/\s*-\s*/)[0];
    // Try to match 'Month YYYY' or 'Month, YYYY'
    let match = start.match(/([A-Za-z]+)[,]?\s*(\d{4})/);
    if (match) {
        const month = parseMonthName(match[1]);
        const year = parseInt(match[2], 10);
        return new Date(year, month, 1);
    }
    // Try to match just a year
    match = start.match(/(\d{4})/);
    if (match) {
        return new Date(parseInt(match[1], 10), 0, 1);
    }
    // Fallback: if 'current', 'present', etc
    if (/current|present|now/i.test(dateStr)) {
        return now;
    }
    return null;
}

// 2. Compute proportional positions based on realStartDate, and flip timeline (most recent at top)
function computeTimelinePositions() {
    // Find min/max date
    const dates = timelineEvents.map(e => e.realStartDate.getTime());
    const minDate = Math.min(...dates);
    const maxDate = Math.max(...dates);
    // Assign position (0-1) based on date, but flip so most recent is at position 0
    timelineEvents.forEach(event => {
        if (maxDate === minDate) {
            event.position = 0.5;
        } else {
            // Flip: most recent (maxDate) is position 0, oldest (minDate) is position 1
            event.position = 1 - (event.realStartDate.getTime() - minDate) / (maxDate - minDate);
        }
    });
    // Sort events so most recent is first in the array (for rendering, navigation, etc)
    timelineEvents.sort((a, b) => b.realStartDate - a.realStartDate);
}

// Generate the winding path for the timeline with proper variable declaration
function generatePath() {
    // Increased path height to 1800px for more vertical space
    const pathData = "M0,0 C50,100 100,200 200,300 C300,400 200,600 300,700 C400,800 300,1000 400,1100 C500,1200 600,1300 500,1400 C400,1500 500,1600 400,1700 C300,1800 400,1800 600,1800";
    return pathData;
}

// Update SVG viewBox to match container dimensions and timeline length
function updateSvgViewBox() {
    const container = document.querySelector('.timeline-container');
    const svg = document.querySelector('.timeline-svg');
    // Set the SVG viewBox to match the full height needed for the timeline
    svg.setAttribute('viewBox', `00 00 1000 1800`);
    // Set a fixed minimum height for the container to ensure all content is visible
    container.style.minHeight = '1800px';
}

// Call updateSvgViewBox immediately and on window load
updateSvgViewBox();
window.addEventListener('load', updateSvgViewBox);

// Get the timeline curve and container
const timelinePath = document.getElementById('timeline-curve');
const timelineContainer = document.querySelector('.timeline-container');
const overlay = document.querySelector('.overlay');
const menuToggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('nav');
const progressBar = document.querySelector('.timeline-progress-bar');

// Menu toggle for mobile
menuToggle.addEventListener('click', function() {
    nav.classList.toggle('active');
});

// Function to get point at a specific position along a path
function getPointAtPosition(path, position) {
    const pathLength = path.getTotalLength();
    const point = path.getPointAtLength(pathLength * position);
    return { x: point.x, y: point.y };
}

// Function to calculate the angle of the tangent at a point on the path
function getAngleAtPosition(path, position) {
    const pathLength = path.getTotalLength();
    const point = path.getPointAtLength(pathLength * position);
    const prevPoint = path.getPointAtLength(Math.max(0, pathLength * position - 1));
    const nextPoint = path.getPointAtLength(Math.min(pathLength, pathLength * position + 1));
    
    // Calculate the angle based on the surrounding points
    const dx = nextPoint.x - prevPoint.x;
    const dy = nextPoint.y - prevPoint.y;
    
    return Math.atan2(dy, dx);
}

// --- Animated Connectors ---
function animateConnectorLine(line) {
    line.style.strokeDasharray = line.getTotalLength();
    line.style.strokeDashoffset = line.getTotalLength();
    line.getBoundingClientRect(); // force reflow
    line.style.transition = 'stroke-dashoffset 1s cubic-bezier(0.77,0,0.18,1)';
    line.style.strokeDashoffset = 0;
}

function createConnector(dotPosition, nodeX, nodeY, color) {
    const svg = document.querySelector('.timeline-svg');
    const connector = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    connector.classList.add('node-connector');
    connector.setAttribute('x1', dotPosition.x);
    connector.setAttribute('y1', dotPosition.y);
    connector.setAttribute('x2', nodeX);
    connector.setAttribute('y2', nodeY);
    connector.setAttribute('stroke', color || '#ff3264');
    connector.setAttribute('stroke-width', '2');
    svg.appendChild(connector);
    // Animate the connector
    animateConnectorLine(connector);
}

function createTimelineDot(position) {
    const path = document.getElementById('timeline-curve');
    const pathLength = path.getTotalLength();
    const point = path.getPointAtLength(pathLength * position);
    // No offset needed, container and SVG are same size
    const dot = document.createElement('div');
    dot.className = 'timeline-dot';
    dot.style.left = `${point.x}px`;
    dot.style.top = `${point.y}px`;
    timelineContainer.appendChild(dot);
    return { x: point.x, y: point.y, point: point };
}

// --- SIMPLE TIMELINE NAVIGATION REWRITE ---
// 1. After loading and sorting, assign a fixed index to each event (chronological order)
// 2. Render nodes in order, each node gets data-index
// 3. When a node is clicked, open detail popup for that index
// 4. Next/Prev buttons and left/right keys increment/decrement the index and call showDetail
// 5. No recalculation, no searching, no scroll-based index changes

async function initTimeline() {
    try {
        timelineEvents = await loadTimelineEventsFromCSV();
        timelineEvents.forEach(event => {
            if (typeof event.date === 'string') event.date = event.date.trim();
        });
        const now = new Date('2025-04-22');
        timelineEvents.forEach(event => {
            event.realStartDate = parseEventStartDate(event.date) || now;
        });
        // When loading, replace \n and \r\n with <br> for HTML display
        timelineEvents.forEach(event => {
            if (event.description) {
                event.description = event.description.replace(/\\n|\r\n/g, '<br>');
            }
        });
        // Sort by realStartDate descending (most recent first)
        timelineEvents.sort((a, b) => b.realStartDate - a.realStartDate);
        timelineEvents.forEach((event, i) => { event.chronologicalIndex = i; });
        computeTimelinePositions(); // <-- This is required to set event.position for rendering
        createTimelineElements();
        renderTimelineTOC();
        // Hide loading overlay
        const overlay = document.getElementById('timeline-loading-overlay');
        if (overlay) {
            overlay.style.opacity = 0;
            setTimeout(() => { overlay.style.display = 'none'; }, 500);
        }
    } catch (e) {
        console.error('Error initializing timeline:', e);
    }
}

function createTimelineElements() {
    updateSvgViewBox();
    document.querySelectorAll('.timeline-dot').forEach(dot => dot.remove());
    document.querySelectorAll('.timeline-node').forEach(node => node.remove());
    document.querySelectorAll('.node-connector').forEach(connector => connector.remove());
    document.querySelectorAll('.timeline-branch-path').forEach(path => path.remove());

    // --- HOLISTIC NODE DECLUTTERING (Less Overlap Priority, Less Dot Closeness Priority) ---
    const nodeDiameter = 140;
    const timelineCurve = document.getElementById('timeline-curve');
    const numCandidates = 10;
    const spiralMaxRadius = 220;
    const spiralStep = spiralMaxRadius / numCandidates;
    const minPathDist = nodeDiameter / 2 + 30;
    const minDistSq = Math.pow(nodeDiameter * 0.6, 2);
    const dotCache = timelineEvents.map(event => {
        const dotPosition = getPointAtPosition(timelineCurve, event.position);
        const angle = getAngleAtPosition(timelinePath, event.position);
        let nodeOffset = event.nodeOffset;
        if (typeof nodeOffset !== 'number' || isNaN(nodeOffset)) nodeOffset = 100;
        nodeOffset = Math.max(-200, Math.min(200, nodeOffset));
        let idealX = dotPosition.x + Math.cos(angle + Math.PI / 2) * nodeOffset;
        let idealY = dotPosition.y + Math.sin(angle + Math.PI / 2) * nodeOffset;
        return {dotPosition, angle, nodeOffset, idealX, idealY};
    });
    const nodeCandidates = dotCache.map(({idealX, idealY, dotPosition}) => {
        let candidates = [];
        for (let r = 0; r <= spiralMaxRadius; r += spiralStep) {
            for (let s = 0; s < numCandidates; s++) {
                let spiralAngle = (Math.PI * 2 * s / numCandidates);
                let nodeX = idealX + Math.cos(spiralAngle) * r;
                let nodeY = idealY + Math.sin(spiralAngle) * r;
                if (nodeX < 0 || nodeX > 1000 - nodeDiameter || nodeY < 0 || nodeY > 1800 - nodeDiameter) continue;
                if (Math.abs(nodeX - dotPosition.x) < 200 && Math.abs(nodeY - dotPosition.y) < 200) {
                    let distToPath = minDistanceToPath(nodeX + nodeDiameter/2, nodeY + nodeDiameter/2, timelineCurve, 12);
                    if (distToPath < minPathDist) continue;
                }
                const distToDotSq = (nodeX - dotPosition.x) ** 2 + (nodeY - dotPosition.y) ** 2;
                candidates.push({nodeX, nodeY, distToDotSq});
            }
        }
        return candidates;
    });
    let bestArrangement = null;
    let bestScore = -Infinity;
    const maxTries = 3;
    for (let attempt = 0; attempt < maxTries; attempt++) {
        let order = [...Array(timelineEvents.length).keys()];
        for (let i = order.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [order[i], order[j]] = [order[j], order[i]];
        }
        let placed = [];
        let arrangement = Array(timelineEvents.length);
        let score = 0;
        for (let idx of order) {
            let best = null;
            let bestLocalScore = -Infinity;
            for (const cand of nodeCandidates[idx]) {
                let tooMuchOverlap = false;
                let anyOverlap = false;
                for (const placedNode of placed) {
                    const dx = cand.nodeX - placedNode.x;
                    const dy = cand.nodeY - placedNode.y;
                    const distSq = dx*dx + dy*dy;
                    if (distSq < Math.pow(nodeDiameter,2)) anyOverlap = true;
                    if (distSq < Math.pow(nodeDiameter*0.7,2)) {
                        const dist = Math.sqrt(distSq);
                        const r = nodeDiameter/2;
                        if (dist < r * 2) {
                            const part1 = r*r*Math.acos((dist*dist + r*r - r*r)/(2*dist*r));
                            const part2 = r*r*Math.acos((dist*dist + r*r - r*r)/(2*dist*r));
                            const part3 = 0.5*Math.sqrt((-dist+r+r)*(dist+r-r)*(dist-r+r)*(dist+r+r));
                            const overlapArea = part1 + part2 - part3;
                            const nodeArea = Math.PI*r*r;
                            if (overlapArea/nodeArea > 0.3) {
                                tooMuchOverlap = true;
                                break;
                            }
                        } else {
                            tooMuchOverlap = true;
                            break;
                        }
                    }
                }
                if (tooMuchOverlap) continue;
                // --- New scoring: prioritize no overlap, de-prioritize closeness ---
                let localScore = -cand.distToDotSq / 4; // much less penalty for being far
                if (!anyOverlap) localScore += 10000; // much higher bonus for no overlap
                if (localScore > bestLocalScore) {
                    bestLocalScore = localScore;
                    best = cand;
                }
            }
            if (nodeCandidates[idx].length === 0) {
                let {idealX, idealY} = dotCache[idx];
                idealX = Math.max(0, Math.min(idealX, 1000 - nodeDiameter));
                idealY = Math.max(0, Math.min(idealY, 1800 - nodeDiameter));
                if (placed.some(p => (idealX-p.x)**2 + (idealY-p.y)**2 < minDistSq)) {
                    idealX = Math.max(0, Math.min(idealX + 40, 1000 - nodeDiameter));
                    idealY = Math.max(0, Math.min(idealY + 40, 1800 - nodeDiameter));
                }
                best = { nodeX: idealX, nodeY: idealY, distToDotSq: 0 };
            }
            if (!best) best = nodeCandidates[idx][0];
            arrangement[idx] = best;
            placed.push({x: best.nodeX, y: best.nodeY});
            if (bestLocalScore > 0) score += bestLocalScore;
        }
        if (score > bestScore) {
            bestScore = score;
            bestArrangement = arrangement;
        }
    }
    // 3. Place nodes using best arrangement
    document.querySelectorAll('.timeline-dot').forEach(dot => dot.remove());
    document.querySelectorAll('.timeline-node').forEach(node => node.remove());
    document.querySelectorAll('.node-connector').forEach(connector => connector.remove());
    document.querySelectorAll('.timeline-branch-path').forEach(path => path.remove());
    bestArrangement.forEach((pos, index) => {
        const event = timelineEvents[index];
        const dotPosition = createTimelineDot(event.position);
        const nodeX = Math.max(0, Math.min(pos.nodeX, 1000 - nodeDiameter));
        const nodeY = Math.max(0, Math.min(pos.nodeY, 1800 - nodeDiameter));        const node = document.createElement('div');
        node.className = 'timeline-node';
        node.style.left = `${nodeX}px`;
        node.style.top = `${nodeY}px`;
        node.dataset.index = index;
        node.dataset.id = event.id; // Add data-id attribute for TOC navigation
        node.tabIndex = 0;
        node.setAttribute('role', 'button');
        node.setAttribute('aria-label', `${event.title}, ${event.date}`);
        if (event.color) {
            node.style.borderColor = event.color;
        }
        node.innerHTML = `
            <div class="node-image">
                <img src="${event.image}" alt="${event.title}" onerror="this.src='/api/placeholder/140/140'; this.onerror=null;">
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
        timelineContainer.appendChild(node);
        // Always connect from the dot to the final node position
        createConnector(dotPosition, nodeX + nodeDiameter/2, nodeY + nodeDiameter/2, event.color);
        const summaryCard = document.createElement('div');
        summaryCard.className = 'timeline-summary-card';
        summaryCard.innerHTML = `
            <strong>${event.title}</strong><br>
            <span>${event.company}</span><br>
            <span style='font-size:0.9em;color:#aaa;'>${event.date}</span><br>
            <button class='summary-view-btn' tabindex='-1'>View Details</button>
        `;
        summaryCard.style.display = 'none';
        node.appendChild(summaryCard);
        node.addEventListener('mouseenter', () => { summaryCard.style.display = 'block'; });
        node.addEventListener('mouseleave', () => { summaryCard.style.display = 'none'; });
        node.addEventListener('focus', () => { summaryCard.style.display = 'block'; });
        node.addEventListener('blur', () => { summaryCard.style.display = 'none'; });
        summaryCard.querySelector('.summary-view-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            showTimelineDetailByIndex(index);
            updateProgressBar();
        });
        node.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                showTimelineDetailByIndex(index);
                updateProgressBar();
            }
        });        node.addEventListener('click', () => {
            showTimelineDetailByIndex(index);
            updateProgressBar();
            // Update TOC active state
            updateTocActiveState(event.id);
        });
        const tooltip = document.createElement('div');
        tooltip.className = 'node-tooltip';
        tooltip.textContent = event.title;
        node.appendChild(tooltip);
    });
    setupTimelineNavigation();
    initPathParticle();
}

// Refactored: showTimelineDetail now takes an index, not an event
function showTimelineDetailByIndex(index) {
    if (index < 0 || index >= timelineEvents.length) return;
    currentActiveNodeIndex = index;
    const event = timelineEvents[index];
    // Debug: print navigation action
    console.log('showTimelineDetailByIndex', index, event.title, event.date, event.realStartDate);
    
    // Update TOC active state
    updateTocActiveState(event.id);
    
    // Remove any existing detail
    const existingDetail = document.querySelector('.timeline-detail');
    if (existingDetail) {
        existingDetail.remove();
    }
    const detail = document.createElement('div');
    detail.className = 'timeline-detail';
    detail.innerHTML = `
        <div class="detail-header" style="border-color: ${event.color || '#ff3264'}">
            <div class="detail-header-content">
                <div class="detail-icon" style="background-color: ${event.color || '#ff3264'}">
                    <i class="${event.icon || 'fas fa-star'}"></i>
                </div>
                <div class="detail-title-row">
                    <div>
                        <span class="detail-date">${event.date}</span>
                    </div>
                    <h2 class="detail-title">${event.title}</h2>
                    <h3 class="detail-sub">${event.company}</h3>
                </div>
            </div>
        </div>
        <div class="detail-content">
            <div class="detail-image-container">
                <img src="${event.image}" alt="${event.title}" class="detail-image" style="border-color: ${event.color || '#ff3264'}">
            </div>
            <p class="detail-description">${event.description}</p>
        </div>
        <div class="detail-nav">
            <button class="detail-nav-btn prev-event"><i class="fas fa-chevron-left"></i> Previous</button>
            <button class="detail-nav-btn next-event">Next <i class="fas fa-chevron-right"></i></button>
        </div>
        <button class="close-detail">×</button>
    `;
    document.body.appendChild(detail);
    setTimeout(() => {
        detail.classList.add('active');
        overlay.classList.add('active');
        // Mark the node as active
        const nodes = document.querySelectorAll('.timeline-node');
        nodes.forEach((node, i) => {
            if (i === index) {
                node.classList.add('active');
            } else {
                node.classList.remove('active');
            }
        });
    }, 10);
    // Close button event
    const closeButton = detail.querySelector('.close-detail');
    closeButton.addEventListener('click', closeDetail);
    // Close on overlay click
    overlay.addEventListener('click', closeDetail);
    // Setup navigation buttons in the detail view
    const prevEventBtn = detail.querySelector('.prev-event');
    const nextEventBtn = detail.querySelector('.next-event');
    prevEventBtn.onclick = () => showTimelineDetailByIndex((currentActiveNodeIndex - 1 + timelineEvents.length) % timelineEvents.length);
    nextEventBtn.onclick = () => showTimelineDetailByIndex((currentActiveNodeIndex + 1) % timelineEvents.length);
    // Keyboard navigation: left/right arrow keys
    detail.tabIndex = 0;
    detail.focus();
    detail.addEventListener('keydown', function(e) {
        if (e.key === 'ArrowLeft') {
            showTimelineDetailByIndex((currentActiveNodeIndex - 1 + timelineEvents.length) % timelineEvents.length);
            e.preventDefault();
        } else if (e.key === 'ArrowRight') {
            showTimelineDetailByIndex((currentActiveNodeIndex + 1) % timelineEvents.length);
            e.preventDefault();
        }
    });
}

// Setup timeline navigation buttons
function setupTimelineNavigation() {
    const prevBtn = document.querySelector('.timeline-nav-btn[data-direction="prev"]');
    const nextBtn = document.querySelector('.timeline-nav-btn[data-direction="next"]');
    
    if (!prevBtn || !nextBtn) {
        console.warn('Timeline navigation buttons not found');
        return;
    }
    
    // Remove hidden attribute to make buttons visible
    prevBtn.removeAttribute('hidden');
    nextBtn.removeAttribute('hidden');
    
    // Add event listeners for navigation
    prevBtn.addEventListener('click', () => {
        const newIndex = (currentActiveNodeIndex - 1 + timelineEvents.length) % timelineEvents.length;
        showTimelineDetailByIndex(newIndex);
    });
    
    nextBtn.addEventListener('click', () => {
        const newIndex = (currentActiveNodeIndex + 1) % timelineEvents.length;
        showTimelineDetailByIndex(newIndex);
    });
    
    // Initialize progress bar
    updateProgressBar();
}

// Animate to a node
function animateToNode(node) {
    const nodeRect = node.getBoundingClientRect();
    const containerRect = timelineContainer.getBoundingClientRect();
    
    const scrollTarget = nodeRect.top + window.scrollY - containerRect.top - window.innerHeight / 2 + nodeRect.height / 2;
    
    window.scrollTo({
        top: scrollTarget,
        behavior: 'smooth'
    });
    
    // Add focus pulse effect
    node.classList.add('pulse-focus');
    setTimeout(() => {
        node.classList.remove('pulse-focus');
    }, 1500);
}

// Update progress bar
function updateProgressBar() {
    if (timelineEvents.length === 0) return;
    
    const progress = currentActiveNodeIndex === -1 ? 0 : 
        (currentActiveNodeIndex / (timelineEvents.length - 1)) * 100;
    
    progressBar.style.width = `${progress}%`;
}

// Initialize the animated particle along the path
function initPathParticle() {
    const particle = document.getElementById('path-particle');
    const path = document.getElementById('timeline-curve');
    const pathLength = path.getTotalLength();
    
    // Animation function
    function animateParticle() {
        const duration = 15000; // 15 seconds for full path traversal
        const now = Date.now();
        const progress = (now % duration) / duration;
        
        const point = path.getPointAtLength(pathLength * progress);
        particle.setAttribute('cx', point.x);
        particle.setAttribute('cy', point.y);
        
        requestAnimationFrame(animateParticle);
    }
    
    animateParticle();
}

// Function to close detail view
function closeDetail() {
    const detail = document.querySelector('.timeline-detail');
    const nodes = document.querySelectorAll('.timeline-node');
    
    if (detail) {
        detail.classList.remove('active');
        overlay.classList.remove('active');
        
        // Remove active class from nodes
        nodes.forEach(node => node.classList.remove('active'));
        
        // Remove detail after transition
        setTimeout(() => {
            if (detail.parentNode) {
                detail.parentNode.removeChild(detail);
            }
        }, 400);
    }
}

// --- Timeline Table of Contents ---
function renderTimelineTOC() {
    const tocContainer = document.querySelector('.timeline-toc-content');
    if (!tocContainer) return;
    
    // Group events by category
    const categoryMap = {};
    timelineEvents.forEach(event => {
        // Use 'branch' field as category, or default to 'Other'
        const category = event.branch || 'Other';
        if (!categoryMap[category]) {
            categoryMap[category] = {
                name: category,
                icon: getCategoryIcon(category),
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
                    <i class="${categoryData.icon}"></i>
                    ${categoryData.name}
                </div>
                <div class="timeline-toc-items">`;
                
        // Sort events within category by date (most recent first)
        categoryData.events
            .sort((a, b) => b.realStartDate - a.realStartDate)
            .forEach(event => {
                const dateStr = formatTocDate(event.realStartDate);
                html += `
                    <div class="timeline-toc-item" data-id="${event.id}">
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
        currentActiveNodeIndex = itemIndex;
        showTimelineDetailByIndex(itemIndex);
        
        // Highlight the node
        const node = document.querySelector(`.timeline-node[data-id='${id}']`);
        if (node) {
            // Ensure the node is visible
            node.scrollIntoView({behavior: 'smooth', block: 'center'});
            
            // Add a pulse effect
            node.classList.add('pulse-focus');
            setTimeout(() => node.classList.remove('pulse-focus'), 1500);
        }
        
        // Update progress bar
        updateProgressBar();
    }
}

// Update active state in TOC based on current node
function updateTocActiveState(id) {
    // Remove active class from all items
    document.querySelectorAll('.timeline-toc-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Add active class to current item
    const activeItem = document.querySelector(`.timeline-toc-item[data-id='${id}']`);
    if (activeItem) {
        activeItem.classList.add('active');
        
        // Ensure active item is visible in scroll container
        const tocContainer = document.querySelector('.timeline-toc-content');
        if (tocContainer) {
            const itemTop = activeItem.offsetTop;
            const containerScrollTop = tocContainer.scrollTop;
            const containerHeight = tocContainer.clientHeight;
            
            if (itemTop < containerScrollTop || itemTop > containerScrollTop + containerHeight) {
                tocContainer.scrollTo({
                    top: itemTop - containerHeight / 2,
                    behavior: 'smooth'
                });
            }
        }
    }
}

// Get appropriate icon for category
function getCategoryIcon(category) {
    const categoryIcons = {
        'Work': 'fas fa-briefcase',
        'Education': 'fas fa-graduation-cap',
        'Projects': 'fas fa-code-branch',
        'Personal': 'fas fa-user',
        'Travel': 'fas fa-plane',
        'Politics': 'fas fa-landmark',
        'Advocacy': 'fas fa-bullhorn',
        'Research': 'fas fa-microscope',
        'Technology': 'fas fa-laptop-code',
        'Creative': 'fas fa-paint-brush',
        'Media': 'fas fa-photo-video',
        'Writing': 'fas fa-pen-fancy'
    };
    
    return categoryIcons[category] || 'fas fa-star';
}

// Get sorted category names (custom order for important categories)
function getSortedCategories(categoryMap) {
    // Define priority categories in desired order
    const priorityOrder = [
        'Work', 'Politics', 'Education', 'Projects', 'Technology', 
        'Advocacy', 'Media', 'Creative', 'Research', 'Writing', 'Personal', 'Travel'
    ];
    
    // Get all category names
    const allCategories = Object.keys(categoryMap);
    
    // Sort categories: priority categories first in specified order, then others alphabetically
    return allCategories.sort((a, b) => {
        const aIndex = priorityOrder.indexOf(a);
        const bIndex = priorityOrder.indexOf(b);
        
        // If both are in priority list, sort by priority order
        if (aIndex >= 0 && bIndex >= 0) {
            return aIndex - bIndex;
        }
        
        // If only a is in priority list, a comes first
        if (aIndex >= 0) return -1;
        
        // If only b is in priority list, b comes first
        if (bIndex >= 0) return 1;
        
        // If neither is in priority list, sort alphabetically
        return a.localeCompare(b);
    });
}

// Format date for TOC display
function formatTocDate(date) {
    if (!date) return '';
    
    const now = new Date();
    const isCurrentYear = date.getFullYear() === now.getFullYear();
    
    // For current year, just show month
    if (isCurrentYear) {
        return date.toLocaleDateString('en-US', { month: 'short' });
    }
    
    // For other years, show year
    return date.getFullYear().toString();
}

// Initialize the path on load
window.addEventListener('load', () => {
    try {
        console.log('Initializing timeline...');
        const pathData = generatePath();
        
        if (timelinePath) {
            timelinePath.setAttribute('d', pathData);
            
            // Create timeline elements once the path is set
            setTimeout(() => {
                try {
                    initTimeline();
                    // Add this line to initialize mobile view when needed
                    handleResponsiveTimeline();
                } catch (error) {
                    console.error('Error initializing timeline:', error);
                }
            }, 100);
        }
    } catch (error) {
        console.error('Error initializing timeline path:', error);
    }
});

function minDistanceToPath(x, y, path, steps = 12) {
    // Returns the minimum distance from (x, y) to the SVG path
    let minDist = Infinity;
    const pathLength = path.getTotalLength();
    for (let i = 0; i <= steps; i++) {
        const pt = path.getPointAtLength((i / steps) * pathLength);
        const dx = x - pt.x;
        const dy = y - pt.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist) minDist = dist;
    }
    return minDist;
}

// --- Timeline Table of Contents ---
function renderTimelineTOC() {
    const tocContainer = document.querySelector('.timeline-toc-content');
    if (!tocContainer) return;
      // Group events by category
    const categoryMap = {};
    timelineEvents.forEach(event => {
        // Determine category based on icon (not branch which is empty)
        let category = 'Other';
        if (event.icon === 'fas fa-suitcase') category = 'Work';
        else if (event.icon === 'fas fa-cogs') category = 'Experiences';
        else if (event.icon === 'fas fa-user-alt') category = 'Personal Projects';
        else if (event.icon === 'fas fa-star') category = 'Highlights';
        
        if (!categoryMap[category]) {
            categoryMap[category] = {
                name: category,
                icon: getCategoryIcon(category),
                color: getCategoryColor(category, event.color),
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
                <div class="timeline-toc-items" style="border-left: 1px dashed ${categoryData.color}40">`;
                // Sort events within category by date (most recent first)
        categoryData.events
            .sort((a, b) => b.realStartDate - a.realStartDate)
            .forEach(event => {
                const dateStr = formatTocDate(event.realStartDate);                html += `
                    <div class="timeline-toc-item" data-id="${event.id}" style="border-left-color: ${event.color || categoryData.color}">
                        <div class="timeline-toc-progress" style="background: linear-gradient(to bottom, ${event.color || categoryData.color}, transparent)"></div>
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
        currentActiveNodeIndex = itemIndex;
        showTimelineDetailByIndex(itemIndex);
        
        // Highlight the node
        const node = document.querySelector(`.timeline-node[data-id='${id}']`);
        if (node) {
            node.scrollIntoView({behavior: 'smooth', block: 'center'});
            node.classList.add('pulse-focus');
            setTimeout(() => node.classList.remove('pulse-focus'), 1500);
        }
    }
}

// Update active state in TOC based on current node
function updateTocActiveState(id) {
    try {
        // Get the current event
        const event = timelineEvents.find(e => e.id === id);
        if (!event) return;
        
        // Remove active class from all items
        document.querySelectorAll('.timeline-toc-item').forEach(item => {
            item.classList.remove('active');
            const progress = item.querySelector('.timeline-toc-progress');
            if (progress) progress.style.height = '0%';
        });
        
        // Add active class to current item
        const activeItem = document.querySelector(`.timeline-toc-item[data-id='${id}']`);
        if (activeItem) {
            activeItem.classList.add('active');
            
            // Animate progress bar
            const progress = activeItem.querySelector('.timeline-toc-progress');
            if (progress) {
                setTimeout(() => {
                    progress.style.height = '100%';
                }, 50);
            }
            
            // Ensure active item is visible in scroll container
            const tocContainer = document.querySelector('.timeline-toc-content');
            if (tocContainer) {
                const itemTop = activeItem.offsetTop;
                const containerScrollTop = tocContainer.scrollTop;
                const containerHeight = tocContainer.clientHeight;
                
                if (itemTop < containerScrollTop || itemTop > containerScrollTop + containerHeight) {
                    tocContainer.scrollTo({
                        top: itemTop - containerHeight / 2,
                        behavior: 'smooth'
                    });
                }
            }
        }
    } catch (error) {
        console.error('Error updating TOC active state:', error);
    }
}

// Get appropriate icon for category
function getCategoryIcon(category) {
    const categoryIcons = {
        'Work': 'fas fa-suitcase',
        'Experiences': 'fas fa-cogs',
        'Personal Projects': 'fas fa-user-alt',
        'Highlights': 'fas fa-star'
    };
    
    return categoryIcons[category] || 'fas fa-star';
}

// Get color for category (based on the typical color used in nodes)
function getCategoryColor(category, fallbackColor) {
    const categoryColors = {
        'Work': '#d17aff',
        'Experiences': '#50dd90',
        'Personal Projects': '#ff7a7a',
        'Highlights': '#ff3264'
    };
    
    return categoryColors[category] || fallbackColor || '#ff3264';
}

// Get sorted category names (custom order for important categories)
function getSortedCategories(categoryMap) {
    // Define priority categories in desired order
    const priorityOrder = [
        'Highlights', 'Work', 'Experiences', 'Personal Projects'
    ];
    
    // Get all category names
    const allCategories = Object.keys(categoryMap);
    
    // Sort categories: priority categories first in specified order, then others alphabetically
    return allCategories.sort((a, b) => {
        const aIndex = priorityOrder.indexOf(a);
        const bIndex = priorityOrder.indexOf(b);
        
        // If both are in priority list, sort by priority order
        if (aIndex >= 0 && bIndex >= 0) {
            return aIndex - bIndex;
        }
        
        // If only a is in priority list, a comes first
        if (aIndex >= 0) return -1;
        
        // If only b is in priority list, b comes first
        if (bIndex >= 0) return 1;
        
        // If neither is in priority list, sort alphabetically
        return a.localeCompare(b);
    });
}

// Format date for TOC display
function formatTocDate(date) {
    if (!date) return '';
    
    const now = new Date();
    const isCurrentYear = date.getFullYear() === now.getFullYear();
    
    // For current year, just show month
    if (isCurrentYear) {
        return date.toLocaleDateString('en-US', { month: 'short' });
    }
    
    // For other years, show year
    return date.getFullYear().toString();
}

// Responsive Timeline Handling
function handleResponsiveTimeline() {
    const isMobile = window.innerWidth <= 768;
    const timelineSvg = document.querySelector('.timeline-svg');
    const timelineContainer = document.querySelector('.timeline-container');
    
    if (isMobile) {
        // Switch to vertical mobile layout
        timelineContainer.classList.add('mobile-view');
        
        // Clear any existing nodes and create vertical layout
        document.querySelectorAll('.timeline-node').forEach(node => node.remove());
        document.querySelectorAll('.node-connector').forEach(connector => connector.remove());
        
        // Create mobile nodes - vertical stack
        timelineEvents.forEach((event, index) => {
            const mobileNode = createMobileTimelineNode(event, index);
            timelineContainer.appendChild(mobileNode);
        });
        
        // Hide SVG path on mobile
        if (timelineSvg) timelineSvg.style.display = 'none';
    } else {
        // Restore desktop view
        timelineContainer.classList.remove('mobile-view');
        if (timelineSvg) timelineSvg.style.display = 'block';
        
        // Recreate desktop timeline
        createTimelineElements();
    }
}

// New function to create mobile-friendly timeline nodes
function createMobileTimelineNode(event, index) {
    const node = document.createElement('div');
    node.className = 'timeline-node mobile-node';
    node.dataset.index = index;
    node.dataset.id = event.id;
    
    node.innerHTML = `
        <div class="mobile-node-content">
            <div class="mobile-node-date">${event.date}</div>
            <div class="mobile-node-header">
                <h3 class="node-title">${event.title}</h3>
                <div class="node-company">${event.company}</div>
            </div>
            <div class="mobile-node-image">
                <img src="${event.image}" alt="${event.title}" onerror="this.src='assets/Piano.png'; this.onerror=null;">
            </div>
            <div class="mobile-node-description">
                ${event.description ? event.description.substring(0, 100) + '...' : ''}
                <button class="mobile-view-more">Read More</button>
            </div>
        </div>
    `;
    
    // Add event listeners
    node.addEventListener('click', () => {
        showTimelineDetailByIndex(index);
    });
    
    return node;
}

// Add to window resize event
window.addEventListener('resize', function() {
    handleResponsiveTimeline();
});
