(function () {
  var input = document.getElementById("query");
  var status = document.getElementById("status");
  var results = document.getElementById("results");
  var suggestions = document.getElementById("suggestions");
  var recipes = null;
  var vocab = null;
  var activeIndex = -1;

  fetch("search-index.json")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      recipes = data;
      status.textContent = "";
      if (input.value.trim()) renderResults();
    })
    .catch(function () {
      status.textContent = "Couldn't load the recipe index.";
    });

  fetch("ingredients-index.json")
    .then(function (r) { return r.json(); })
    .then(function (data) { vocab = data; })
    .catch(function () { vocab = []; });

  function terms(query) {
    return query
      .toLowerCase()
      .split(",")
      .map(function (t) { return t.trim(); })
      .filter(Boolean);
  }

  function occurrences(text, term) {
    return text.split(term).length - 1;
  }

  function renderResults() {
    var q = terms(input.value);
    results.innerHTML = "";
    if (!q.length) {
      status.textContent = "";
      return;
    }
    if (!recipes) {
      status.textContent = "Loading recipes…";
      return;
    }

    var matches = recipes
      .map(function (recipe) {
        var matchedTerms = q.filter(function (t) { return recipe.text.indexOf(t) !== -1; });
        var count = matchedTerms.reduce(function (sum, t) {
          return sum + occurrences(recipe.text, t);
        }, 0);
        return { recipe: recipe, matchedTerms: matchedTerms.length, count: count };
      })
      .filter(function (m) { return m.matchedTerms > 0; })
      .sort(function (a, b) {
        return b.matchedTerms - a.matchedTerms || b.count - a.count ||
          a.recipe.title.localeCompare(b.recipe.title);
      });

    status.textContent = matches.length
      ? matches.length + " recipe" + (matches.length === 1 ? "" : "s")
      : "No recipes match that.";

    matches.forEach(function (m) {
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.href = m.recipe.url;
      a.textContent = m.recipe.title;
      li.appendChild(a);
      var span = document.createElement("span");
      span.className = "match-count";
      span.textContent = " — matches " + m.matchedTerms + "/" + q.length + " ingredient" +
        (q.length === 1 ? "" : "s");
      li.appendChild(span);
      results.appendChild(li);
    });
  }

  function currentPartial() {
    var value = input.value;
    var idx = value.lastIndexOf(",");
    return (idx === -1 ? value : value.slice(idx + 1)).trim().toLowerCase();
  }

  function updateSuggestions() {
    activeIndex = -1;
    var partial = currentPartial();
    if (!partial || !vocab || !vocab.length) {
      renderSuggestions([]);
      return;
    }
    var starts = vocab.filter(function (t) { return t !== partial && t.indexOf(partial) === 0; });
    var contains = vocab.filter(function (t) {
      return t !== partial && t.indexOf(partial) > 0;
    });
    renderSuggestions(starts.concat(contains).slice(0, 8));
  }

  function renderSuggestions(list) {
    suggestions.innerHTML = "";
    list.forEach(function (term) {
      var li = document.createElement("li");
      li.textContent = term;
      li.addEventListener("mousedown", function (e) {
        e.preventDefault();
        applySuggestion(term);
      });
      suggestions.appendChild(li);
    });
  }

  function highlightActive() {
    var items = suggestions.children;
    for (var i = 0; i < items.length; i++) {
      items[i].classList.toggle("active", i === activeIndex);
    }
  }

  function applySuggestion(term) {
    var value = input.value;
    var idx = value.lastIndexOf(",");
    var prefix = idx === -1 ? "" : value.slice(0, idx + 1) + " ";
    input.value = prefix + term + ", ";
    renderSuggestions([]);
    input.focus();
    renderResults();
  }

  var debounce;
  input.addEventListener("input", function () {
    updateSuggestions();
    clearTimeout(debounce);
    debounce = setTimeout(renderResults, 120);
  });

  input.addEventListener("keydown", function (e) {
    var items = suggestions.children;
    if (!items.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, items.length - 1);
      highlightActive();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      highlightActive();
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      applySuggestion(items[activeIndex].textContent);
    } else if (e.key === "Escape") {
      renderSuggestions([]);
    }
  });

  input.addEventListener("blur", function () {
    setTimeout(function () { renderSuggestions([]); }, 100);
  });
})();
