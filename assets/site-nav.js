/* Lucas online catalogues — shared site navigation (black bar under the green brand bar).
 *
 * Use on a page:   <div id="site-nav"></div>  …  <script src="/assets/site-nav.js"></script>
 * To add a catalogue: add it to CATALOGUES below (and to the brand panel on the home page).
 */
(function () {
  'use strict';

  var CATALOGUES = [
    { brand: 'Lucas', anchor: 'lucas', items: [
      { name: 'Gas Springs', href: '/gas-springs/' },
      { name: 'Horns', href: '/horns/' },
      { name: 'Bulbs', href: '/bulbs/' },
      { name: 'Oil Filters', href: '/oil-filters/' },
      { name: 'Air Filters', href: '/air-filters/' },
      { name: 'Wiper Blades', href: '/wiper-blades/' },
      { name: 'Water Pumps', href: '/water-pumps/' }
    ] },
    { brand: 'Girling', anchor: 'girling', items: [
      { name: 'Batteries' }
    ] }
  ];
  var ABOUT_URL = 'https://www.lucasmeaparts.com/about-us';

  var CSS = [
    '.snav{background:#000;border-top:4px solid #00954C;border-bottom:4px solid #00954C;position:sticky;top:0;z-index:50;font-family:"League Spartan",Arial,sans-serif}',
    '.snav-in{max-width:1200px;margin:0 auto;padding:0 24px;display:flex;align-items:center;justify-content:flex-end;gap:6px;min-height:52px}',
    '.snav a,.snav button{font:inherit;color:#fff;background:none;border:1px solid transparent;border-radius:6px;cursor:pointer;text-decoration:none;',
    ' font-size:16px;font-weight:500;padding:9px 14px 7px;display:inline-flex;align-items:center;gap:7px;white-space:nowrap}',
    '.snav a:hover,.snav button:hover{color:#7fd3a8}',
    '.snav .cur{border-color:#fff}',
    '.snav a:focus-visible,.snav button:focus-visible{outline:2px solid #7fd3a8;outline-offset:2px}',
    '.snav .caret{width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:5px solid currentColor;margin-top:-2px}',
    '.snav .dd{position:relative}',
    '.snav .menu{display:none;position:absolute;top:calc(100% + 8px);left:0;min-width:230px;background:#fff;border-top:4px solid #00954C;box-shadow:0 12px 32px rgba(0,0,0,.25);padding:8px 0;z-index:60}',
    '.snav .dd.open .menu{display:block}',
    '.snav .menu.wide{min-width:440px;display:none;grid-template-columns:repeat(2,1fr);gap:0 8px;padding:12px 8px;left:auto;right:0}',
    '.snav .dd.open .menu.wide{display:grid}',
    '.snav .menu a{display:flex;justify-content:space-between;white-space:nowrap;color:#231F20;text-transform:none;letter-spacing:0;font-size:15px;padding:8px 16px 6px;border-radius:0;border:0}',
    '.snav .menu a:hover{background:#e6f4ed;color:#00954C}',
    '.snav .menu h4{margin:6px 16px 4px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#6d6e71}',
    '.snav .menu .soon{display:flex;justify-content:space-between;gap:10px;color:#9a9b9e;font-size:15px;padding:8px 16px 6px;white-space:nowrap}',
    '.snav .menu .soon small{font-size:11px;text-transform:uppercase;letter-spacing:.04em;background:#ededed;color:#6d6e71;border-radius:3px;padding:2px 6px 0;align-self:center}',
    '.snav .cart b{background:#00954C;color:#fff;border-radius:20px;min-width:22px;padding:2px 7px 0;font-size:13px;text-align:center}',
    '.snav .toggle{display:none}',
    '@media (max-width:860px){',
    ' .snav-in{flex-wrap:wrap;justify-content:space-between;padding:0 12px}',
    ' .snav .toggle{display:inline-flex}',
    ' .snav .items{display:none;flex-basis:100%;flex-direction:column;align-items:stretch;padding:4px 0 12px}',
    ' .snav.open .items{display:flex}',
    ' .snav .items>a,.snav .items>.dd>button{width:100%;justify-content:space-between}',
    ' .snav .menu,.snav .menu.wide{position:static;box-shadow:none;min-width:0;border-top:0;background:#111;grid-template-columns:1fr;padding:4px 0 8px}',
    ' .snav .menu a{color:#fff;padding-left:28px}.snav .menu a:hover{background:#1d1d1d;color:#7fd3a8}',
    ' .snav .menu h4{color:#9a9b9e;margin-left:28px}.snav .menu .soon{padding-left:28px;color:#8a8b8e}',
    '}'
  ].join('\n');

  var path = location.pathname.replace(/index\.html$/, '');
  var onHome = path === '/' ;
  function cls(match) { return match ? ' class="cur" aria-current="page"' : ''; }

  var catalogueMenu = CATALOGUES.map(function (c) {
    return '<div><h4>' + c.brand + '</h4>' + c.items.map(function (it) {
      return it.href ? '<a href="' + it.href + '"' + (path.indexOf(it.href) === 0 ? ' aria-current="page"' : '') + '>' + it.name + '</a>'
                     : '<span class="soon">' + it.name + '<small>Soon</small></span>';
    }).join('') + '</div>';
  }).join('');

  var html =
    '<nav class="snav" aria-label="Main"><div class="snav-in">' +
      '<button type="button" class="toggle" aria-expanded="false" aria-controls="snav-items">Menu <span class="caret"></span></button>' +
      '<a class="cart toggle-cart' + (path.indexOf('/cart/') === 0 ? ' cur" aria-current="page"' : '"') + ' href="/cart/">Cart <b data-cart-count>0</b></a>' +
      '<div class="items" id="snav-items" style="display:contents">' +
        '<a href="/"' + cls(onHome) + '>Home</a>' +
        '<div class="dd"><button type="button" aria-expanded="false">Catalogues <span class="caret"></span></button><div class="menu wide">' + catalogueMenu + '</div></div>' +
        '<a href="' + ABOUT_URL + '" target="_blank" rel="noopener">About Lucas</a>' +
        '<a href="/cart/#contact">Contact us</a>' +
      '</div>' +
    '</div></nav>';

  function mount() {
    var host = document.getElementById('site-nav');
    if (!host || host.__mounted) return;
    host.__mounted = true;
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    host.outerHTML = html;
    var nav = document.querySelector('.snav'), items = nav.querySelector('.items'), toggle = nav.querySelector('.toggle');
    var mq = window.matchMedia('(max-width:860px)');
    function layout() {
      // desktop: items sit inline after the cart link is moved to the end; mobile: Menu button + cart, items fold out
      var cart = nav.querySelector('.toggle-cart');
      if (mq.matches) { items.style.display = ''; nav.querySelector('.snav-in').insertBefore(cart, items); }
      else { items.style.display = 'contents'; items.appendChild(cart); nav.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); }
    }
    layout(); (mq.addEventListener ? mq.addEventListener('change', layout) : mq.addListener(layout));

    toggle.addEventListener('click', function () {
      var open = !nav.classList.contains('open'); nav.classList.toggle('open', open); toggle.setAttribute('aria-expanded', String(open));
    });
    var dds = nav.querySelectorAll('.dd');
    function closeAll(except) { dds.forEach(function (d) { if (d !== except) { d.classList.remove('open'); d.querySelector('button').setAttribute('aria-expanded', 'false'); } }); }
    dds.forEach(function (d) {
      var b = d.querySelector('button');
      b.addEventListener('click', function (e) { e.stopPropagation(); var open = !d.classList.contains('open'); closeAll(d); d.classList.toggle('open', open); b.setAttribute('aria-expanded', String(open)); });
      d.addEventListener('mouseenter', function () { if (!mq.matches) { closeAll(d); d.classList.add('open'); b.setAttribute('aria-expanded', 'true'); } });
      d.addEventListener('mouseleave', function () { if (!mq.matches) { d.classList.remove('open'); b.setAttribute('aria-expanded', 'false'); } });
      d.querySelector('.menu').addEventListener('click', function (e) { if (e.target.closest('a')) { closeAll(); nav.classList.remove('open'); } });
    });
    document.addEventListener('click', function (e) { if (!nav.contains(e.target)) closeAll(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAll(); });
    if (window.LucasCart) { var n = LucasCart.count(); nav.querySelectorAll('[data-cart-count]').forEach(function (el) { el.textContent = n; }); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
