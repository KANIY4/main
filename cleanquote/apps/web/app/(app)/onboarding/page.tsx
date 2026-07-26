import { redirect } from 'next/navigation';

import { ActionForm, Field, Select } from '@/components/form';
import { completeOnboardingAction } from '@/lib/actions/workflow';
import { currentSession } from '@/lib/session';

export const metadata = { title: 'Set up your company' };

const COUNTRIES = [
  { value: 'AU', label: 'Australia' },
  { value: 'NZ', label: 'New Zealand' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'IE', label: 'Ireland' },
  { value: 'CA', label: 'Canada' },
  { value: 'US', label: 'United States' },
  { value: 'ZA', label: 'South Africa' },
  { value: 'SG', label: 'Singapore' },
];

const CURRENCIES = ['AUD', 'NZD', 'GBP', 'EUR', 'CAD', 'USD', 'ZAR', 'SGD'].map((code) => ({
  value: code,
  label: code,
}));

const SIZES = [
  { value: '1', label: 'Just me' },
  { value: '2-10', label: '2 to 10 people' },
  { value: '11-50', label: '11 to 50 people' },
  { value: '51-200', label: '51 to 200 people' },
  { value: '200+', label: 'More than 200' },
];

const CATEGORIES = [
  ['commercial_office', 'Commercial office'],
  ['retail', 'Retail'],
  ['healthcare', 'Healthcare and aged care'],
  ['childcare', 'Childcare and education'],
  ['industrial', 'Industrial and warehouse'],
  ['window_cleaning', 'Window cleaning'],
  ['periodical', 'Periodical and floor care'],
  ['post_construction', 'Post-construction'],
] as const;

export default async function OnboardingPage() {
  const session = await currentSession();
  if (!session) redirect('/sign-in');
  if (session.memberships.length > 0) redirect('/dashboard');

  return (
    <div className="stack">
      <div>
        <p className="eyebrow">Step 1 of 1</p>
        <h1>Set up your company</h1>
        <p className="muted" style={{ maxWidth: '62ch' }}>
          Quick Start asks only for what changes a price, then fills the rest with clearly labelled
          starting points you can edit at any time. Those starting points are the product&rsquo;s
          defaults — they are not market benchmarks, and nothing treats them as confirmed until you
          say so.
        </p>
      </div>

      <div className="card">
        <ActionForm
          action={completeOnboardingAction}
          submitLabel="Create company and start quoting"
          pendingLabel="Setting up…"
        >
          <input type="hidden" name="path" value="quick_start" />

          <fieldset>
            <legend>Company</legend>
            <Field label="Company name" name="companyName" required />
            <div className="grid grid-2">
              <Select label="Country" name="countryCode" options={COUNTRIES} defaultValue="AU" />
              <Select
                label="Currency"
                name="currencyCode"
                options={CURRENCIES}
                defaultValue="AUD"
              />
            </div>
            <div className="grid grid-2">
              <Field label="Tax name" name="taxLabel" defaultValue="GST" />
              <Field
                label="Tax percentage"
                name="taxRatePct"
                defaultValue="10"
                inputMode="decimal"
              />
            </div>
            <div className="grid grid-2">
              <Field
                label="Primary service region"
                name="primaryServiceRegion"
                placeholder="Melbourne"
              />
              <Select label="Company size" name="companySize" options={SIZES} defaultValue="2-10" />
            </div>
          </fieldset>

          <fieldset>
            <legend>What you clean</legend>
            <div className="checkbox-grid">
              {CATEGORIES.map(([value, label]) => (
                <label key={value} className="checkbox">
                  <input type="checkbox" name="serviceCategories" value={value} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>Commercial basics</legend>
            <div className="grid grid-2">
              <Select
                label="Labour model"
                name="labourModel"
                options={[
                  { value: 'employee', label: 'Employees' },
                  { value: 'subcontractor', label: 'Subcontractors' },
                  { value: 'mixed', label: 'A mix of both' },
                ]}
                defaultValue="employee"
              />
              <Field
                label="Default cleaner cost per hour"
                name="defaultLabourCost"
                defaultValue="31.80"
                inputMode="decimal"
                hint="What an hour of cleaning costs you before on-costs."
              />
            </div>
            <div className="grid grid-2">
              <Field
                label="Minimum gross margin %"
                name="minimumGrossMarginPct"
                defaultValue="20"
                inputMode="decimal"
                hint="Quotes below this need approval before they can be sent."
              />
              <Field
                label="Quote validity (days)"
                name="quoteValidityDays"
                defaultValue="30"
                inputMode="numeric"
              />
            </div>
          </fieldset>

          <fieldset>
            <legend>Contact details for proposals</legend>
            <div className="grid grid-2">
              <Field label="Contact email" name="contactEmail" type="email" inputMode="email" />
              <Field label="Contact phone" name="contactPhone" inputMode="tel" />
            </div>
          </fieldset>
        </ActionForm>
      </div>

      <p className="footnote">
        Everything the product fills in for you is recorded with its source and marked as
        unconfirmed. Your dashboard lists them so you can review each one when you are ready.
      </p>
    </div>
  );
}
