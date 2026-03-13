(async function() {
  'use strict';

  // Load timeline data
  const resp = await fetch('./history-data.json');
  const periods = await resp.json();

  // Build period nav chips
  const navInner = document.getElementById('periodNavInner');
  periods.forEach((p, i) => {
    const chip = document.createElement('button');
    chip.className = 'period-chip';
    chip.dataset.index = i;
    chip.innerHTML = `<span class="chip-dot" style="background:${p.color}"></span>${p.period}`;
    chip.addEventListener('click', () => {
      const entry = document.getElementById('entry-' + p.id);
      if (entry) {
        entry.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
    navInner.appendChild(chip);
  });

  // Build timeline entries
  const timeline = document.getElementById('timeline');

  periods.forEach((p) => {
    const entry = document.createElement('article');
    entry.className = 'timeline-entry';
    entry.id = 'entry-' + p.id;

    // Build features list
    const featuresHtml = p.features.map(f =>
      `<li style="--dot-color:${p.color}">${f}</li>`
    ).join('');

    // Build projects
    const projectsHtml = p.projects.map(pr =>
      `<div class="project-card">
        <div class="project-name">${pr.name}</div>
        <div class="project-desc">${pr.desc}</div>
      </div>`
    ).join('');

    entry.innerHTML = `
      <div class="timeline-dot" style="background:${p.color}">${p.icon}</div>
      <div class="entry-header">
        <span class="entry-years" style="background:${p.color}15;color:${p.color}">${p.years}</span>
        <h2 class="entry-title">${p.period}</h2>
        <p class="entry-summary">${p.summary}</p>
      </div>
      <div class="entry-card">
        <img class="entry-image" src="${p.image}" alt="${p.imageCaption}" loading="lazy">
        <div class="entry-body">
          <p class="entry-description">${p.description}</p>
          <div class="entry-stats">
            <span class="stats-icon">📊</span>
            ${p.stats}
          </div>
          <div class="entry-features">
            <div class="features-title">主要特征</div>
            <ul class="features-list">${featuresHtml}</ul>
          </div>
          <div class="entry-projects">
            <div class="projects-title">典型项目</div>
            <div class="project-cards">${projectsHtml}</div>
          </div>
        </div>
      </div>
    `;

    timeline.appendChild(entry);
  });

  // Apply feature dot colors via CSS custom property
  document.querySelectorAll('.features-list li').forEach(li => {
    const c = li.style.getPropertyValue('--dot-color');
    li.querySelector('::before');
    // Use inline style on the pseudo via a style rule
  });

  // Add dynamic CSS for feature dots per period
  const styleSheet = document.createElement('style');
  let dynamicCSS = '';
  periods.forEach(p => {
    dynamicCSS += `#entry-${p.id} .features-list li::before { background: ${p.color}; }\n`;
  });
  styleSheet.textContent = dynamicCSS;
  document.head.appendChild(styleSheet);

  // Intersection Observer for scroll animations
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
      }
    });
  }, {
    threshold: 0.05,
    rootMargin: '0px 0px -60px 0px'
  });

  document.querySelectorAll('.timeline-entry').forEach(el => observer.observe(el));

  // Update active period chip on scroll
  const periodChips = document.querySelectorAll('.period-chip');
  const entryEls = document.querySelectorAll('.timeline-entry');

  function updateActiveChip() {
    const scrollY = window.scrollY + 160;
    let activeIdx = 0;

    entryEls.forEach((el, i) => {
      if (el.offsetTop <= scrollY) {
        activeIdx = i;
      }
    });

    periodChips.forEach((chip, i) => {
      chip.classList.toggle('active', i === activeIdx);
    });

    // Scroll the active chip into view in the nav
    const activeChip = periodChips[activeIdx];
    if (activeChip) {
      const nav = document.getElementById('periodNav');
      const chipRect = activeChip.getBoundingClientRect();
      const navRect = nav.getBoundingClientRect();
      if (chipRect.left < navRect.left || chipRect.right > navRect.right) {
        activeChip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }

  // Throttled scroll handler
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        updateActiveChip();
        ticking = false;
      });
      ticking = true;
    }
  });

  // Initial state
  updateActiveChip();

})();
