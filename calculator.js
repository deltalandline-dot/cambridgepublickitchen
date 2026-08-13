(function () {
  var FRACTIONS = {
    "¼": 0.25, "½": 0.5, "¾": 0.75,
    "⅓": 1 / 3, "⅔": 2 / 3,
    "⅕": 0.2, "⅖": 0.4, "⅗": 0.6, "⅘": 0.8,
    "⅙": 1 / 6, "⅚": 5 / 6,
    "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875
  };
  var FRACTION_CHARS = Object.keys(FRACTIONS).join("");
  // Tried in order: a mixed number ("1 ½", where the space is genuinely part
  // of the number and must be consumed), then a plain integer/decimal alone
  // (leaving any following space in `rest`, e.g. "1 head" -> rest=" head"),
  // then a bare fraction ("½ c").
  var MIXED_RE = new RegExp("^(\\s*~?\\s*)(\\d+)\\s+([" + FRACTION_CHARS + "])");
  var INT_RE = /^(\s*~?\s*)(\d+(?:\.\d+)?)/;
  var FRAC_RE = new RegExp("^(\\s*~?\\s*)([" + FRACTION_CHARS + "])");
  var DISPLAY = [
    [0, ""], [0.125, "⅛"], [0.25, "¼"], [1 / 3, "⅓"], [0.375, "⅜"], [0.5, "½"],
    [0.625, "⅝"], [2 / 3, "⅔"], [0.75, "¾"], [0.875, "⅞"]
  ];

  function parseQty(text) {
    var m = text.match(MIXED_RE);
    var value;
    if (m) {
      value = parseFloat(m[2]) + FRACTIONS[m[3]];
    } else if ((m = text.match(INT_RE))) {
      value = parseFloat(m[2]);
    } else if ((m = text.match(FRAC_RE))) {
      value = FRACTIONS[m[2]];
    } else {
      return null;
    }
    if (!value) return null;
    return { value: value, matchLen: m[0].length, rest: text.slice(m[0].length) };
  }

  function formatQty(value) {
    var whole = Math.floor(value + 1e-9);
    var frac = value - whole;
    var best = DISPLAY[0], bestDiff = 1;
    DISPLAY.forEach(function (pair) {
      var diff = Math.abs(frac - pair[0]);
      if (diff < bestDiff) { bestDiff = diff; best = pair; }
    });
    if (bestDiff < 0.03) {
      if (best[0] === 0) return String(whole);
      return (whole ? whole + " " : "") + best[1];
    }
    return String(Math.round(value * 100) / 100);
  }

  function findQuantityCells(table) {
    var section = "";
    var seenInstructions = false;
    var cells = [];
    Array.prototype.forEach.call(table.querySelectorAll("tr"), function (row) {
      var tds = row.querySelectorAll("td");
      if (tds.length === 1) {
        if (tds[0].querySelector("b")) {
          section = tds[0].textContent.toLowerCase();
          if (section.indexOf("instruction") !== -1) seenInstructions = true;
        }
        return;
      }
      if (tds.length !== 2 || seenInstructions || section.indexOf("ingredient") === -1) return;
      if (!tds[1].textContent.trim()) return;
      var qty = parseQty(tds[0].textContent);
      if (qty) cells.push({ cell: tds[0], original: tds[0].textContent, parsed: qty });
    });
    return cells;
  }

  function render(cells, multiplier) {
    cells.forEach(function (c) {
      if (multiplier === 1) {
        c.cell.textContent = c.original;
        return;
      }
      c.cell.textContent = formatQty(c.parsed.value * multiplier) + c.parsed.rest;
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var table = document.querySelector("table");
    var box = document.getElementById("scale-box");
    if (!table || !box) return;
    var cells = findQuantityCells(table);
    if (!cells.length) {
      box.style.display = "none";
      return;
    }

    function setMultiplier(m) {
      if (!m || m <= 0) return;
      render(cells, m);
      Array.prototype.forEach.call(box.querySelectorAll("button"), function (btn) {
        btn.classList.toggle("active", parseFloat(btn.dataset.mult) === m);
      });
    }

    box.querySelectorAll("button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        document.getElementById("scale-custom").value = "";
        setMultiplier(parseFloat(btn.dataset.mult));
      });
    });
    var custom = document.getElementById("scale-custom");
    custom.addEventListener("input", function () {
      var m = parseFloat(custom.value);
      if (m > 0) {
        Array.prototype.forEach.call(box.querySelectorAll("button"), function (btn) {
          btn.classList.remove("active");
        });
        render(cells, m);
      }
    });
  });
})();
