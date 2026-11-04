<script setup lang="ts">
// Project imports
import { VAT_OPTION_LABELS } from '@/domains/invoices/vatOptionLabels';
import { formatCents, type Cents } from '@/form/amounts';
import type { InvoiceTotals, VatGroup } from '@/services/invoices';

// An invoice's totals as the backend computed them. Shows, never adds up:
// the rounding lives in one place, the backend's InvoiceTotals.
defineProps<{
    totals: InvoiceTotals;
}>();

// The guard proved them integers; the brand says they are cents.
const euros = (cents: number): string => formatCents(cents as Cents);

// The rate comes from the backend, with the group, so the percentage shown
// is the one the VAT was computed at. Exempt has none.
const groupLabel = (group: VatGroup): string => (group.rate_percent === null
    ? `${VAT_OPTION_LABELS[group.vat_option]} on ${euros(group.base_cents)}`
    : `VAT ${VAT_OPTION_LABELS[group.vat_option].toLowerCase()} (${group.rate_percent}%) on ${euros(group.base_cents)}`);
</script>

<template>
    <dl>
        <dt>Subtotal</dt>
        <dd>{{ euros(totals.subtotal_cents) }}</dd>
        <template v-for="group in totals.vat_groups" :key="group.vat_option">
            <dt>{{ groupLabel(group) }}</dt>
            <dd>{{ euros(group.vat_cents) }}</dd>
        </template>
        <dt>Total</dt>
        <dd>{{ euros(totals.total_cents) }}</dd>
    </dl>
</template>
