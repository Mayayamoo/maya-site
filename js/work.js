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
    const res = await fetch(path);
    if (!res.ok) throw new Error('csv file broke');
    const csv = await res.text();
    return parseCSV(csv);
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
        return "M0,0 C50,100 100,200 200,300 C300,400 200,600 300,700 C400,800 300,1000 400,1100 C500,1200 600,1300 500,1400 C400,1500 500,1600 400,1700 C300,1800 400,1800 600,1800";
    }
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

    // cleanup
    document.querySelectorAll('.timeline-dot, .timeline-node, .node-connector, .timeline-track, .timeline-entries').forEach(el => el.remove());

    if (isMobile) {
        // mobile bubbles
        createMobileTimelineBubbles();
    } else {
        // desktop stuff
        const nodeDiameter = 140;
        const svgWidth = 1000;
        const svgHeight = 1800;

        if (!timelinePath || typeof timelinePath.getTotalLength !== 'function' || timelinePath.getTotalLength() === 0) {
            console.error("Timeline curve not ready or not an SVG path for createTimelineElements.");
            return;
        }

        // Adjust decluttering parameters for mobile
        const numCandidates = 10;
        const spiralMaxRadius = isMobile ? 150 : 220; // Increased for better spacing
        const spiralStep = spiralMaxRadius / numCandidates;
        const minPathDist = nodeDiameter / 2 + (isMobile ? 20 : 30);
        // Increased minimum distance between nodes for mobile
        const minDistSqNodes = Math.pow(nodeDiameter * (isMobile ? 1.2 : 0.7), 2);

        const dotCache = timelineEvents.map(event => {
            const dotPosition = getPointAtPosition(timelinePath, event.position);
            const angle = getAngleAtPosition(timelinePath, event.position);
            
            // Adjust node offset for mobile - ensure nodes are closer to center line
            let nodeOffsetCsv = event.nodeOffset;
            if (typeof nodeOffsetCsv !== 'number' || isNaN(nodeOffsetCsv)) {
                nodeOffsetCsv = isMobile ? 70 : 100;
            } else {
                // Keep nodes at reasonable distance from timeline on mobile
                nodeOffsetCsv = isMobile ? Math.sign(nodeOffsetCsv) * Math.min(Math.abs(nodeOffsetCsv * 0.4), 90) : nodeOffsetCsv;
            }
            
            // Ensure mobile nodes alternate sides for better distribution
            if (isMobile) {
                // Use event.id to determine alternating sides (even/odd)
                if (event.id % 2 === 0) {
                    nodeOffsetCsv = Math.abs(nodeOffsetCsv);
                } else {
                    nodeOffsetCsv = -Math.abs(nodeOffsetCsv);
                }
            }
            
            // Limit offset range
            nodeOffsetCsv = Math.max(isMobile ? -90 : -200, Math.min(isMobile ? 90 : 200, nodeOffsetCsv));
            
            let idealX = dotPosition.x + Math.cos(angle + Math.PI / 2) * nodeOffsetCsv;
            let idealY = dotPosition.y + Math.sin(angle + Math.PI / 2) * nodeOffsetCsv;
            
            return { dotPosition, angle, nodeOffset: nodeOffsetCsv, idealX, idealY };
        });

        const nodeCandidates = dotCache.map(({ idealX, idealY, dotPosition }) => {
            let candidates = [];
            for (let r = 0; r <= spiralMaxRadius; r += spiralStep) {
                for (let s = 0; s < numCandidates; s++) {
                    let spiralAngle = (Math.PI * 2 * s / numCandidates);
                    let nodeX = idealX + Math.cos(spiralAngle) * r; // Top-left X
                    let nodeY = idealY + Math.sin(spiralAngle) * r; // Top-left Y

                    if (nodeX < 0 || nodeX + nodeDiameter > svgWidth || nodeY < 0 || nodeY + nodeDiameter > svgHeight) continue;

                    if (Math.abs(nodeX + nodeDiameter / 2 - dotPosition.x) < (isMobile ? 150 : 250) && Math.abs(nodeY + nodeDiameter / 2 - dotPosition.y) < (isMobile ? 150 : 250)) {
                        if (minDistanceToPath(nodeX + nodeDiameter / 2, nodeY + nodeDiameter / 2, timelinePath, 12) < minPathDist) continue;
                    }
                    const distToDotSq = Math.pow(nodeX + nodeDiameter / 2 - dotPosition.x, 2) + Math.pow(nodeY + nodeDiameter / 2 - dotPosition.y, 2);
                    candidates.push({ nodeX, nodeY, distToDotSq });
                }
            }
            if (candidates.length === 0) { // Add ideal position if no other candidates found
                candidates.push({ nodeX: Math.max(0, Math.min(idealX, svgWidth - nodeDiameter)), nodeY: Math.max(0, Math.min(idealY, svgHeight - nodeDiameter)), distToDotSq: 0 });
            }
            return candidates;
        });

        let bestArrangement = null;
        let bestScore = -Infinity;
        const maxTries = isMobile ? 2 : 3; // Fewer tries on mobile for performance

        for (let attempt = 0; attempt < maxTries; attempt++) {
            let order = [...Array(timelineEvents.length).keys()];
            for (let i = order.length - 1; i > 0; i--) { // Shuffle order
                const j = Math.floor(Math.random() * (i + 1));
                [order[i], order[j]] = [order[j], order[i]];
            }
            let placedNodes = []; // Stores {x, y} of top-left of placed nodes
            let currentArrangement = Array(timelineEvents.length);
            let currentScore = 0;

            for (let idx of order) {
                let bestCandidateForNode = null;
                let bestLocalScore = -Infinity;

                for (const cand of nodeCandidates[idx]) { // cand.nodeX, cand.nodeY are top-left
                    let isOverlapping = false;
                    for (const placed of placedNodes) {
                        const dx = (cand.nodeX + nodeDiameter / 2) - (placed.x + nodeDiameter / 2);
                        const dy = (cand.nodeY + nodeDiameter / 2) - (placed.y + nodeDiameter / 2);
                        if ((dx * dx + dy * dy) < minDistSqNodes) {
                            isOverlapping = true;
                            break;
                        }
                    }
                    if (isOverlapping) continue;

                    let localScore = -cand.distToDotSq / (isMobile ? 1000 : 4000); // Penalize distance from dot
                    // Bonus for not overlapping (already implicitly handled by `continue` but can be explicit)
                    // localScore += isMobile ? 50 : 100; 

                    if (localScore > bestLocalScore) {
                        bestLocalScore = localScore;
                        bestCandidateForNode = cand;
                    }
                }
                
                if (!bestCandidateForNode && nodeCandidates[idx].length > 0) { // Fallback: pick first candidate if no non-overlapping found
                     bestCandidateForNode = nodeCandidates[idx][0];
                } else if (!bestCandidateForNode) { // Absolute fallback: use ideal position
                     let { idealX, idealY } = dotCache[idx];
                     bestCandidateForNode = { nodeX: Math.max(0, Math.min(idealX, svgWidth - nodeDiameter)), nodeY: Math.max(0, Math.min(idealY, svgHeight - nodeDiameter)), distToDotSq: 0 };
                }

                currentArrangement[idx] = bestCandidateForNode;
                placedNodes.push({ x: bestCandidateForNode.nodeX, y: bestCandidateForNode.nodeY });
                currentScore += bestLocalScore;
            }

            if (currentScore > bestScore) {
                bestScore = currentScore;
                bestArrangement = currentArrangement;
            }
        }
        
        if (!bestArrangement) { // Fallback if decluttering completely fails
            console.warn("Node decluttering failed, using ideal positions as fallback.");
            bestArrangement = dotCache.map(({ idealX, idealY }) => ({
                nodeX: Math.max(0, Math.min(idealX, svgWidth - nodeDiameter)),
                nodeY: Math.max(0, Math.min(idealY, svgHeight - nodeDiameter)),
            }));
        }

        // Spread events vertically on mobile
        if (isMobile) {
            // For mobile, adjust event positions to spread them out vertically
            const eventCount = timelineEvents.length;
            
            // Distribute events evenly along the vertical path
            timelineEvents.forEach((event, idx) => {
                // Start from 0.05 and end at 0.95 to avoid edges
                event.position = 0.05 + ((idx + 1) / (eventCount + 1)) * 0.9;
            });
            
            // Recalculate dot positions with new event positions
            dotCache.forEach((cache, idx) => {
                const newDotPosition = getPointAtPosition(timelinePath, timelineEvents[idx].position);
                cache.dotPosition = newDotPosition;
                
                // Recalculate ideal node position - ensure alternating left/right pattern
                const angle = getAngleAtPosition(timelinePath, timelineEvents[idx].position);
                cache.angle = angle;
                
                // Alternate nodes left and right of path
                let nodeOffset = (idx % 2 === 0) ? 70 : -70;
                cache.nodeOffset = nodeOffset;
                
                cache.idealX = newDotPosition.x + Math.cos(Math.PI/2) * nodeOffset; // horizontal offset only
                cache.idealY = newDotPosition.y; // keep same vertical position as dot
            });
        }

        bestArrangement.forEach((pos, index) => {
            const event = timelineEvents[index];
            const dotPosition = createTimelineDot(event.position);
            
            const nodeX = pos.nodeX;
            const nodeY = pos.nodeY;

            const node = document.createElement('div');
            node.className = 'timeline-node';
            node.style.left = `${nodeX}px`;
            node.style.top = `${nodeY}px`;
            // Set size directly for more consistent sizing across devices
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

            const placeholderSize = isMobile ? 100 : 140;
            node.innerHTML = `
                <div class="node-image">
                    <img src="${event.image || `https://via.placeholder.com/${placeholderSize}/000000/FFFFFF?text=No+Image`}" alt="${event.title}" onerror="this.src='https://via.placeholder.com/${placeholderSize}/000000/FFFFFF?text=Error'; this.onerror=null;">
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
            createConnector(dotPosition, nodeX + nodeDiameter / 2, nodeY + nodeDiameter / 2, event.color, isMobile);

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
        setupTimelineNavigation(); // If you have global next/prev buttons
        if (document.getElementById('path-particle')) {
          initPathParticle();
        }
    }
}

// Function to create the mobile timeline with bubble cards - updated to remove descriptions
function createMobileTimelineBubbles() {
    // Clear any existing elements that might cause spacing issues
    document.querySelectorAll('.mobile-filter-bar, .timeline-track, .timeline-entries').forEach(el => el.remove());
    
    // Create filter buttons
    const filterBar = document.createElement('div');
    filterBar.className = 'mobile-filter-bar';
    filterBar.style.marginTop = '0'; // Ensure no top margin
    
    // Create icon-based filter categories with proper names
    const filterCategories = [
        { id: 'all', name: 'All', icon: 'fas fa-globe' },
        { id: 'fas fa-suitcase', name: 'Work', icon: 'fas fa-suitcase' },
        { id: 'fas fa-user-alt', name: 'Personal', icon: 'fas fa-user-alt' },
        { id: 'fas fa-star', name: 'Featured', icon: 'fas fa-star' },
        { id: 'fas fa-cogs', name: 'Projects', icon: 'fas fa-cogs' }
    ];
    
    // Create filter buttons for each category
    filterCategories.forEach(category => {
        const button = document.createElement('button');
        button.className = 'mobile-filter-btn' + (category.id === 'all' ? ' active' : '');
        button.setAttribute('data-filter', category.id);
        button.innerHTML = `<i class="${category.icon}"></i> ${category.name}`;
        
        button.addEventListener('click', () => {
            // Update active state
            document.querySelectorAll('.mobile-filter-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            button.classList.add('active');
            
            // Filter entries by icon
            filterMobileEntries(category.id);
        });
        
        filterBar.appendChild(button);
    });
    
    // Insert filter bar before the timeline track
    timelineContainer.insertBefore(filterBar, timelineContainer.firstChild);
    
    // Create the track line
    const track = document.createElement('div');
    track.className = 'timeline-track';
    track.style.marginTop = '0';
    track.style.top = '0';
    track.innerHTML = '<div class="track-line"></div><div class="track-glow"></div>';
    
    // Create the entries container - ensure it has no top margin/padding
    const entriesContainer = document.createElement('div');
    entriesContainer.className = 'timeline-entries';
    entriesContainer.style.marginTop = '0';
    entriesContainer.style.paddingTop = '5px';
    
    // Add elements to the DOM - order matters for spacing
    timelineContainer.appendChild(filterBar);
    timelineContainer.appendChild(track);
    timelineContainer.appendChild(entriesContainer);
    
    // Create timeline entries for each event - showing all entries with continuous scrolling
    timelineEvents.forEach((event, index) => {
        const entry = document.createElement('div');
        entry.className = 'timeline-entry';
        entry.dataset.category = event.branch || 'Other';
        entry.dataset.id = event.id;
        entry.dataset.index = index;
        entry.dataset.icon = event.icon || 'fas fa-atom'; // Store icon for filtering
        entry.style.display = 'flex'; // Show all entries by default
        
        // Add featured class if this is a highlight or special event
        if (event.branch === 'Highlights' || event.icon === 'fas fa-star') {
            entry.classList.add('featured');
        }
        
        entry.innerHTML = `
            <div class="entry-connector">
                <div class="connector-line"></div>
                <div class="connector-dot"></div>
            </div>
            <div class="entry-card">
                <div class="card-corner top-left"></div>
                <div class="card-corner top-right"></div>
                <div class="card-corner bottom-left"></div>
                <div class="card-corner bottom-right"></div>
                
                ${entry.classList.contains('featured') ? '<div class="featured-tag">✨ Featured</div>' : ''}
                <div class="card-date">${event.date}</div>
                <div class="card-header">
                    <h2>${event.title}</h2>
                    <div class="card-company">${event.company || ''}</div>
                </div>
                <div class="card-footer">
                    <button class="card-btn" data-id="${event.id}">
                        <span>Tell me more!</span>
                    </button>
                    <div class="category-badge" style="--badge-color: ${event.color || getCategoryColor(event.branch || 'Other')};">
                        <i class="${event.icon || getCategoryIcon(event.branch || 'Other')}"></i>
                    </div>
                </div>
            </div>
        `;
        
        entriesContainer.appendChild(entry);
        
        // Add random subtle rotations to corners for quirky feel
        entry.querySelectorAll('.card-corner').forEach(corner => {
            const randomRotation = (Math.random() * 6) - 3;
            corner.style.transform = `rotate(${randomRotation}deg)`;
        });
        
        // Add click listener to the "Tell me more" button
        entry.querySelector('.card-btn').addEventListener('click', () => {
            showTimelineDetailByIndex(index);
            updateTocActiveState(event.id);
        });
    });
    
    // Hide navigation controls since we're showing all entries
    const navWrapper = document.querySelector('.timeline-navigation');
    if (navWrapper) {
        navWrapper.style.display = 'none';
    }
}

// Function to filter mobile timeline entries by icon
function filterMobileEntries(filter) {
    const entries = document.querySelectorAll('.timeline-entry');
    
    entries.forEach(entry => {
        if (filter === 'all') {
            entry.style.display = 'flex';
        } else {
            const entryIcon = entry.dataset.icon;
            if (filter === entryIcon) {
                entry.style.display = 'flex';
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

    if (isMobile) {
        timelineContainer.classList.add('mobile-timeline-active');
        timelineContainer.classList.remove('desktop-timeline-active');
        
        // Reset container spacing for mobile
        timelineContainer.style.marginTop = '0';
        timelineContainer.style.paddingTop = '0';
        
        // Reduce SVG height if not needed
        if (document.querySelector('.timeline-svg')) {
            document.querySelector('.timeline-svg').style.height = 'auto';
        }
    } else {
        timelineContainer.classList.remove('mobile-timeline-active');
        timelineContainer.classList.add('desktop-timeline-active');
    }
    
    if (timelineEvents && timelineEvents.length > 0) {
        createTimelineElements(); // Re-render with adaptive parameters
    }
}

window.addEventListener('load', () => {
    if (timelinePath) {
        const pathData = generatePath();
        timelinePath.setAttribute('d', pathData);
        initTimeline().then(() => {
            handleResponsiveTimeline(); // Initial responsive setup after data is loaded
        }).catch(err => console.error("Error during initial timeline load sequence:", err));
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

// Ensure old/conflicting functions like adjustTimelineElements, createMobileTimelineNode, 
// and multiple handleResponsiveTimeline definitions are removed.
// The logic is now consolidated.
