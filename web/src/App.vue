<script setup lang="ts">
import { computed, ref } from "vue";
import { ApiError, CrawlResult, friendlyError, pollCrawl, startCrawl, validateUrl } from "./api";

type View = "idle" | "loading" | "done" | "error";

const url = ref("");
const touched = ref(false);
const view = ref<View>("idle");
const result = ref<CrawlResult | null>(null);
const errorCode = ref("");

const validationError = computed(() => validateUrl(url.value));
const showValidation = computed(() => touched.value && url.value.length > 0 && validationError.value);
const canSubmit = computed(() => !validationError.value && view.value !== "loading");

async function crawl() {
  touched.value = true;
  if (!canSubmit.value) return;

  view.value = "loading";
  result.value = null;
  errorCode.value = "";

  try {
    const uid = await startCrawl(url.value);
    result.value = await pollCrawl(uid);
    view.value = "done";
  } catch (err) {
    errorCode.value = err instanceof ApiError ? err.code : "network";
    view.value = "error";
  }
}
</script>

<template>
  <main class="page">
    <header>
      <h1>Web Crawler</h1>
      <p class="lead">Take a full-page screenshot of a website and get a short design review.</p>
    </header>

    <form class="search" novalidate @submit.prevent="crawl">
      <div class="field">
        <input
          v-model="url"
          type="url"
          placeholder="https://example.com"
          aria-label="Website URL"
          :aria-invalid="!!showValidation"
          :class="{ invalid: showValidation }"
          @input="touched = true"
        />
        <p v-if="showValidation" class="hint">{{ validationError }}</p>
      </div>
      <button type="submit" :disabled="!canSubmit">Crawl</button>
    </form>

    <section v-if="view === 'error'" class="error" role="alert">
      <p>{{ friendlyError(errorCode) }}</p>
      <button type="button" @click="crawl">Retry</button>
    </section>

    <section v-if="view === 'done' && result" class="result">
      <div class="result-meta">
        <a :href="result.url" target="_blank" rel="noopener noreferrer">{{ result.url }}</a>
        <span>{{ (result.tookMs / 1000).toFixed(1) }}s</span>
      </div>
      <div class="result-body">
        <div class="shot">
          <img :src="result.image" :alt="`Screenshot of ${result.url}`" />
        </div>
        <article class="description">{{ result.description }}</article>
      </div>
    </section>

    <div v-if="view === 'loading'" class="overlay" role="status" aria-live="polite">
      <div class="spinner" />
      <p>Crawling the page. This can take up to a minute.</p>
    </div>
  </main>
</template>
