import { useEffect } from 'react';

function upsertMeta({ selector, create, value }) {
  const el = document.querySelector(selector);
  if (el) {
    el.setAttribute('content', value);
    return;
  }
  if (create) {
    const meta = document.createElement('meta');
    Object.entries(create).forEach(([k, v]) => meta.setAttribute(k, v));
    meta.setAttribute('content', value);
    document.head.appendChild(meta);
  }
}

export function useSeoForCustomer({ title, description, ogImageUrl }) {
  useEffect(() => {
    if (!title) return;
    document.title = title;

    if (description) {
      upsertMeta({
        selector: 'meta[name="description"]',
        create: { name: 'description' },
        value: description,
      });
      upsertMeta({
        selector: 'meta[property="og:description"]',
        create: { property: 'og:description' },
        value: description,
      });
    }

    upsertMeta({
      selector: 'meta[property="og:title"]',
      create: { property: 'og:title' },
      value: title,
    });

    if (ogImageUrl) {
      upsertMeta({
        selector: 'meta[property="og:image"]',
        create: { property: 'og:image' },
        value: ogImageUrl,
      });
    }
  }, [title, description, ogImageUrl]);
}

