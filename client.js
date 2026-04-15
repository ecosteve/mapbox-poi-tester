if (typeof window !== "undefined" && typeof document !== "undefined") {
const CATEGORY_COLOR_MAP = {
  hospital: "#d9485f",
  emergency_room: "#ef6b56",
  urgent_care: "#f39c4f",
  doctor: "#5882c2",
  clinic: "#6f73d2",
  medical_center: "#4f9e8a",
  pharmacy: "#208f7d",
};
const DEFAULT_CATEGORIES = [
  { id: "hospital", label: "Hospital", selected: true },
  { id: "emergency_room", label: "Emergency room", selected: true },
  { id: "urgent_care", label: "Urgent care", selected: true },
  { id: "doctor", label: "Doctor", selected: false },
  { id: "clinic", label: "Clinic", selected: false },
  { id: "medical_center", label: "Medical center", selected: false },
  { id: "pharmacy", label: "Pharmacy", selected: false },
];
const FALLBACK_CENTER = { lng: -122.4194, lat: 37.7749, label: "San Francisco fallback" };
const RESULTS_PER_CATEGORY = 10;

const state = {
  token: window.APP_CONFIG?.mapboxToken ?? "",
  map: null,
  biasMarker: null,
  popup: null,
  biasPoint: { ...FALLBACK_CENTER },
  categories: [...DEFAULT_CATEGORIES],
  results: [],
  availableCategoryIds: null,
};

const elements = {
  locationInput: document.querySelector("#location-input"),
  locationSearchBtn: document.querySelector("#location-search-btn"),
  locateBtn: document.querySelector("#locate-btn"),
  biasSummary: document.querySelector("#bias-summary"),
  categoryList: document.querySelector("#category-list"),
  selectedCount: document.querySelector("#selected-count"),
  searchBtn: document.querySelector("#search-btn"),
  status: document.querySelector("#status"),
  categorySummary: document.querySelector("#category-summary"),
  resultsCount: document.querySelector("#results-count"),
  resultsList: document.querySelector("#results-list"),
};

function init() {
  bindEvents();
  hydrateForm();
  renderCategories();
  if (state.token) {
    initializeToken();
  } else {
    setStatus("Missing Mapbox token. Add `MAPBOX_TOKEN` to `.env` and restart the server.", "error");
  }
  requestCurrentLocation();
}

function bindEvents() {
  elements.locationSearchBtn.addEventListener("click", searchForLocation);
  elements.locationInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      searchForLocation();
    }
  });
  elements.locateBtn.addEventListener("click", requestCurrentLocation);
  elements.searchBtn.addEventListener("click", runCategorySearch);
}

function hydrateForm() {
  elements.biasSummary.textContent = "Drag the map marker or click on the map to move the bias point.";
}

function initializeToken() {
  if (!state.token) {
    setStatus("Missing Mapbox token. Add `MAPBOX_TOKEN` to `.env` and restart the server.", "error");
    return;
  }

  if (!state.map) {
    createMap();
  } else {
    state.map.setConfigProperty?.("basemap", "lightPreset", "day");
  }

  setStatus("Map ready. You can reposition the bias marker and run a search.");
}

function createMap() {
  if (!state.token || state.map) {
    return;
  }

  mapboxgl.accessToken = state.token;
  state.map = new mapboxgl.Map({
    container: "map",
    style: "mapbox://styles/mapbox/light-v11",
    center: [state.biasPoint.lng, state.biasPoint.lat],
    zoom: 12,
  });

  state.map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");

  state.map.on("load", () => {
    ensureResultLayers();
    attachBiasMarker();
    updateMapResults(state.results);

    state.map.on("mouseenter", "results-circles", () => {
      state.map.getCanvas().style.cursor = "pointer";
    });

    state.map.on("mouseleave", "results-circles", () => {
      state.map.getCanvas().style.cursor = "";
    });

    state.map.on("click", "results-circles", (event) => {
      const feature = event.features?.[0];
      if (!feature) {
        return;
      }
      openPopup(feature);
    });
  });

  state.map.on("click", (event) => {
    updateBiasPoint(event.lngLat.lng, event.lngLat.lat, "Bias moved from map click.");
  });
}

function attachBiasMarker() {
  if (!state.map) {
    return;
  }

  const markerEl = document.createElement("div");
  markerEl.className = "bias-pin";

  state.biasMarker = new mapboxgl.Marker({ element: markerEl, draggable: true })
    .setLngLat([state.biasPoint.lng, state.biasPoint.lat])
    .addTo(state.map);

  state.biasMarker.on("dragend", () => {
    const lngLat = state.biasMarker.getLngLat();
    updateBiasPoint(lngLat.lng, lngLat.lat, "Bias moved by dragging the marker.");
  });
}

function ensureResultLayers() {
  if (!state.map.getSource("results")) {
    state.map.addSource("results", {
      type: "geojson",
      data: emptyCollection(),
    });
  }

  if (!state.map.getLayer("results-circles")) {
    state.map.addLayer({
      id: "results-circles",
      type: "circle",
      source: "results",
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          6,
          5,
          12,
          8,
          16,
          11,
        ],
        "circle-color": [
          "match",
          ["get", "searchCategory"],
          ...buildCategoryColorExpression(),
          "#123036",
        ],
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
        "circle-opacity": 0.9,
      },
    });
  }
}

function buildCategoryColorExpression() {
  return Object.entries(CATEGORY_COLOR_MAP).flatMap(([categoryId, color]) => [categoryId, color]);
}

function requestCurrentLocation() {
  if (!navigator.geolocation) {
    setStatus("Geolocation is not supported in this browser. Using fallback location.", "error");
    if (state.token && !state.map) {
      createMap();
    }
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      updateBiasPoint(
        position.coords.longitude,
        position.coords.latitude,
        "Bias set to your current location."
      );
      if (state.token && !state.map) {
        createMap();
      }
    },
    () => {
      setStatus("Current location was unavailable. Using fallback location until you choose one.", "error");
      if (state.token && !state.map) {
        createMap();
      }
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

function updateBiasPoint(lng, lat, message) {
  state.biasPoint = {
    lng: Number(lng.toFixed(6)),
    lat: Number(lat.toFixed(6)),
  };

  elements.biasSummary.textContent = `Bias point: ${state.biasPoint.lat}, ${state.biasPoint.lng}`;

  if (state.biasMarker) {
    state.biasMarker.setLngLat([state.biasPoint.lng, state.biasPoint.lat]);
  }

  if (state.map) {
    state.map.easeTo({
      center: [state.biasPoint.lng, state.biasPoint.lat],
      duration: 700,
      zoom: Math.max(state.map.getZoom(), 11),
    });
  }

  if (message) {
    setStatus(message);
  }
}

async function searchForLocation() {
  const query = elements.locationInput.value.trim();

  if (!query) {
    setStatus("Enter a city, address, or landmark to move the bias point.", "error");
    return;
  }

  if (!state.token) {
    setStatus("Add a Mapbox token before searching for a location.", "error");
    return;
  }

  setStatus(`Searching for "${query}"...`);

  try {
    const params = new URLSearchParams({
      q: query,
      access_token: state.token,
      limit: "1",
      types: "address,place,locality,neighborhood,postcode,district,city,region,country",
      proximity: `${state.biasPoint.lng},${state.biasPoint.lat}`,
    });

    const response = await fetch(`https://api.mapbox.com/search/searchbox/v1/forward?${params.toString()}`);
    const data = await readResponseBody(response);
    const feature = data.features?.[0];

    if (!response.ok || !feature) {
      throw new Error(formatApiError(data, response, "No location match found."));
    }

    const [lng, lat] = feature.geometry.coordinates;
    updateBiasPoint(lng, lat, `Bias moved to ${feature.properties.full_address || feature.properties.name}.`);
  } catch (error) {
    setStatus(error.message || "Location lookup failed.", "error");
  }
}

function renderCategories() {
  elements.categoryList.innerHTML = "";

  state.categories.forEach((category) => {
    const row = document.createElement("label");
    row.className = "category-card";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = category.selected;
    input.addEventListener("change", () => {
      category.selected = input.checked;
      updateSelectionCount();
    });

    const text = document.createElement("div");
    text.innerHTML = `<strong>${formatCategoryLabel(category.label || category.id)}</strong><small>${category.id}</small>`;

    const remove = document.createElement("button");
    remove.className = "category-card__remove";
    remove.type = "button";
    remove.setAttribute("aria-label", `Remove ${category.id}`);
    remove.textContent = "×";
    remove.addEventListener("click", (event) => {
      event.preventDefault();
      removeCategory(category.id);
    });

    row.append(input, text, remove);
    elements.categoryList.append(row);
  });

  updateSelectionCount();
}

function updateSelectionCount() {
  const count = getSelectedCategories().length;
  elements.selectedCount.textContent = `${count} selected`;
}

function removeCategory(categoryId) {
  state.categories = state.categories.filter((category) => category.id !== categoryId);
  renderCategories();
}

function getSelectedCategories() {
  return state.categories.filter((category) => category.selected);
}

async function runCategorySearch() {
  const selectedCategories = getSelectedCategories();

  if (!state.token) {
    setStatus("Add a Mapbox token before running searches.", "error");
    return;
  }

  if (!selectedCategories.length) {
    setStatus("Select at least one category to search.", "error");
    return;
  }

  if (!state.map) {
    createMap();
  }

  const countryCodes = window.APP_CONFIG?.countryCodes || "NZ";
  let availableCategoryIds = null;

  try {
    availableCategoryIds = await fetchAvailableCategoryIds();
  } catch (error) {
    setStatus(`Unable to load Mapbox category catalog. ${formatUnknownError(error, "Check token permissions.")}`, "error");
    renderSummary(
      selectedCategories.map((category) => ({
        categoryId: category.id,
        count: "Category catalog request failed",
        tone: "error",
      }))
    );
    state.results = [];
    updateMapResults(state.results);
    renderResults();
    return;
  }

  const unsupportedCategories = selectedCategories.filter((category) => !availableCategoryIds.has(category.id));
  const supportedCategories = selectedCategories.filter((category) => availableCategoryIds.has(category.id));

  setStatus(`Searching ${selectedCategories.length} categories near ${state.biasPoint.lat}, ${state.biasPoint.lng}...`);

  const results = await Promise.allSettled(
    supportedCategories.map((category) =>
      fetchCategory(category.id, {
        limit: RESULTS_PER_CATEGORY,
        country: countryCodes,
        proximity: `${state.biasPoint.lng},${state.biasPoint.lat}`,
      })
    )
  );

  const mergedFeatures = [];
  const summary = unsupportedCategories.map((category) => ({
    categoryId: category.id,
    count: "Unsupported Mapbox category id",
    tone: "error",
  }));

  results.forEach((result, index) => {
    const categoryId = supportedCategories[index].id;

    if (result.status === "fulfilled") {
      const features = result.value.features.map((feature) => decorateFeature(feature, categoryId));
      mergedFeatures.push(...features);
      summary.push({ categoryId, count: features.length, tone: "default" });
      return;
    }

    const errorMessage = formatUnknownError(result.reason, `Request failed for ${categoryId}`);
    summary.push({
      categoryId,
      count: errorMessage,
      tone: "error",
    });
  });

  state.results = dedupeFeatures(mergedFeatures).sort((left, right) => {
    return (left.properties.distanceMeters ?? Infinity) - (right.properties.distanceMeters ?? Infinity);
  });

  updateMapResults(state.results);
  renderSummary(summary);
  renderResults();

  const successCount = summary.filter((item) => item.tone !== "error").length;
  const firstError = summary.find((item) => item.tone === "error");
  const message =
    successCount === 0
      ? `All category lookups failed. ${firstError?.count || "Check category ids and token permissions."}`
      : `Showing ${state.results.length} places across ${successCount} successful searches.`;
  setStatus(message, successCount === 0 ? "error" : undefined);
}

async function fetchCategory(categoryId, options) {
  const params = new URLSearchParams({
    access_token: state.token,
    language: "en",
    limit: String(options.limit),
    proximity: options.proximity,
    types: "poi",
  });

  if (options.country) {
    params.set("country", options.country);
  }

  const response = await fetch(
    `https://api.mapbox.com/search/searchbox/v1/category/${encodeURIComponent(categoryId)}?${params.toString()}`
  );
  const data = await readResponseBody(response);

  if (!response.ok) {
    throw new Error(formatApiError(data, response, `Search failed for ${categoryId}`));
  }

  return data;
}

async function fetchAvailableCategoryIds() {
  if (state.availableCategoryIds) {
    return state.availableCategoryIds;
  }

  const params = new URLSearchParams({
    access_token: state.token,
    language: "en",
  });

  const response = await fetch(`https://api.mapbox.com/search/searchbox/v1/list/category?${params.toString()}`);
  const data = await readResponseBody(response);

  if (!response.ok) {
    throw new Error(formatApiError(data, response, "Unable to load categories."));
  }

  state.availableCategoryIds = new Set((data.list_items || []).map((item) => item.canonical_id).filter(Boolean));
  return state.availableCategoryIds;
}

async function readResponseBody(response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function formatApiError(data, response, fallbackMessage) {
  const detail =
    stringifyErrorValue(data?.message) ||
    stringifyErrorValue(data?.error) ||
    stringifyErrorValue(data?.errors) ||
    stringifyErrorValue(data);

  if (!detail) {
    return fallbackMessage;
  }

  if (!response?.status || response.status < 400) {
    return detail;
  }

  return `${response.status} ${response.statusText}: ${detail}`;
}

function formatUnknownError(error, fallbackMessage) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return stringifyErrorValue(error) || fallbackMessage;
}

function stringifyErrorValue(value) {
  if (value == null) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => stringifyErrorValue(item)).filter(Boolean).join("; ");
  }

  if (typeof value === "object") {
    const preferredKeys = ["message", "error", "type", "code", "id", "category", "reason", "details"];
    const parts = preferredKeys
      .map((key) => {
        if (!(key in value)) {
          return "";
        }

        const nested = stringifyErrorValue(value[key]);
        return nested ? `${key}: ${nested}` : "";
      })
      .filter(Boolean);

    if (parts.length) {
      return parts.join(", ");
    }

    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value);
}

function decorateFeature(feature, categoryId) {
  const [lng, lat] = feature.geometry.coordinates;
  const distanceMeters = haversineDistance(state.biasPoint, { lng, lat });

  return {
    ...feature,
    properties: {
      ...feature.properties,
      searchCategory: categoryId,
      searchColor: getCategoryColor(categoryId),
      distanceMeters,
    },
  };
}

function dedupeFeatures(features) {
  const seen = new Map();

  features.forEach((feature) => {
    const key = feature.properties.mapbox_id || feature.properties.name + feature.geometry.coordinates.join(",");
    if (!seen.has(key)) {
      seen.set(key, feature);
      return;
    }

    const existing = seen.get(key);
    const mergedCategories = new Set([
      existing.properties.searchCategory,
      feature.properties.searchCategory,
      ...(existing.properties.poi_category_ids || []),
      ...(feature.properties.poi_category_ids || []),
    ]);

    seen.set(key, {
      ...existing,
      properties: {
        ...existing.properties,
        searchCategory: existing.properties.searchCategory,
        matchedCategories: Array.from(mergedCategories),
      },
    });
  });

  return Array.from(seen.values());
}

function updateMapResults(features) {
  if (!state.map || !state.map.getSource("results")) {
    return;
  }

  state.map.getSource("results").setData({
    type: "FeatureCollection",
    features,
  });

  if (!features.length) {
    return;
  }

  const bounds = new mapboxgl.LngLatBounds();
  bounds.extend([state.biasPoint.lng, state.biasPoint.lat]);
  features.forEach((feature) => bounds.extend(feature.geometry.coordinates));
  state.map.fitBounds(bounds, { padding: 80, duration: 700, maxZoom: 14 });
}

function renderSummary(summary) {
  elements.categorySummary.innerHTML = "";

  summary.forEach((item) => {
    const chip = document.createElement("span");
    chip.className = "summary-chip";
    chip.dataset.tone = item.tone;
    chip.textContent =
      item.tone === "error"
        ? `${item.categoryId}: ${item.count}`
        : `${item.categoryId}: ${item.count} result${item.count === 1 ? "" : "s"}`;
    elements.categorySummary.append(chip);
  });
}

function renderResults() {
  elements.resultsList.innerHTML = "";
  elements.resultsCount.textContent = `${state.results.length} shown`;

  if (!state.results.length) {
    const empty = document.createElement("div");
    empty.className = "result-card";
    empty.innerHTML = `
      <h3>No POIs yet</h3>
      <p>Choose categories, place the bias marker, and run a search to inspect the returned medical POIs.</p>
    `;
    elements.resultsList.append(empty);
    return;
  }

  state.results.forEach((feature) => {
    const card = document.createElement("article");
    card.className = "result-card";
    card.addEventListener("click", () => focusFeature(feature));

    const badgeColor = getCategoryColor(feature.properties.searchCategory);
    const address = feature.properties.full_address || feature.properties.address || feature.properties.place_formatted;
    const distanceLabel = formatDistance(feature.properties.distanceMeters);

    card.innerHTML = `
      <div class="result-card__top">
        <div>
          <h3>${feature.properties.name}</h3>
          <p>${address || "Address unavailable"}</p>
        </div>
        <span class="badge" style="background:${badgeColor}">${formatCategoryLabel(
      feature.properties.searchCategory
    )}</span>
      </div>
      <p>${distanceLabel}${renderMatchedCategories(feature.properties.matchedCategories)}</p>
    `;
    elements.resultsList.append(card);
  });
}

function focusFeature(feature) {
  if (!state.map) {
    return;
  }

  state.map.flyTo({
    center: feature.geometry.coordinates,
    zoom: 15,
    duration: 700,
  });
  openPopup(feature);
}

function openPopup(feature) {
  if (!state.map) {
    return;
  }

  state.popup?.remove();

  const categories = feature.properties.matchedCategories || [feature.properties.searchCategory];
  const html = `
    <p class="popup-title">${feature.properties.name}</p>
    <p class="popup-meta">${feature.properties.full_address || feature.properties.address || feature.properties.place_formatted || "Address unavailable"}</p>
    <p class="popup-meta">${formatDistance(feature.properties.distanceMeters)} from bias point</p>
    <p class="popup-meta">Matched: ${categories.map(formatCategoryLabel).join(", ")}</p>
  `;

  state.popup = new mapboxgl.Popup({ closeButton: false, offset: 18 })
    .setLngLat(feature.geometry.coordinates)
    .setHTML(html)
    .addTo(state.map);
}

function setStatus(message, tone) {
  elements.status.textContent = message;
  if (tone) {
    elements.status.dataset.tone = tone;
  } else {
    delete elements.status.dataset.tone;
  }
}

function getCategoryColor(categoryId) {
  if (CATEGORY_COLOR_MAP[categoryId]) {
    return CATEGORY_COLOR_MAP[categoryId];
  }

  const palette = ["#0b7a75", "#5882c2", "#f39c4f", "#d9485f", "#6f73d2", "#4f9e8a"];
  let hash = 0;
  for (const character of categoryId) {
    hash = (hash << 5) - hash + character.charCodeAt(0);
    hash |= 0;
  }
  return palette[Math.abs(hash) % palette.length];
}

function formatCategoryLabel(value) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function renderMatchedCategories(categories) {
  if (!categories || categories.length < 2) {
    return "";
  }

  return ` • Also matched ${categories
    .filter(Boolean)
    .map(formatCategoryLabel)
    .join(", ")}`;
}

function formatDistance(distanceMeters) {
  if (!Number.isFinite(distanceMeters)) {
    return "Distance unavailable";
  }

  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)} m away`;
  }

  return `${(distanceMeters / 1000).toFixed(1)} km away`;
}

function haversineDistance(origin, target) {
  const toRadians = (value) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const deltaLat = toRadians(target.lat - origin.lat);
  const deltaLng = toRadians(target.lng - origin.lng);
  const lat1 = toRadians(origin.lat);
  const lat2 = toRadians(target.lat);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

function emptyCollection() {
  return { type: "FeatureCollection", features: [] };
}

init();
}
