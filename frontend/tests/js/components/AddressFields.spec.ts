import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';

import AddressFields from '@/components/AddressFields.vue';
import type { FieldError } from '@/composables/useForm';
import { COUNTRY_CODES, type Address, type AddressField, type CountryCode, type ForeignAddress } from '@/services/address';

const emptyAddress = (): Address => ({
    street: '',
    house_number: '',
    house_number_addition: null,
    postal_code: '',
    city: '',
    region: null,
    country_code: 'NL',
});

// ForeignAddress, not Address: a test spreads a region into it, which only
// the foreign side of the union allows.
const emptyGermanAddress = (): ForeignAddress => ({ ...emptyAddress(), postal_code: null, region: null, country_code: 'DE' });

interface MountOptions
{
    fieldError?: (field: AddressField) => FieldError | null;
    countryCodes?: readonly CountryCode[]; // default NL only, as on the business form
    address?: Address;
}

// Mounts AddressFields the way a parent form does: an address bound with
// v-model, the parent's form name, and its fieldError. The address is
// returned so a test can check it was left alone. Each emitted address is
// fed back as the new modelValue, as v-model in a parent would.
const mountAddressFields = ({ fieldError = () => null, countryCodes = ['NL'], address = emptyAddress() }: MountOptions = {}) =>
{
    const wrapper = mount(AddressFields, {
        props: {
            modelValue: address,
            'onUpdate:modelValue': async (next: Address) => wrapper.setProps({ modelValue: next }),
            formName: 'client',
            fieldError,
            countryCodes,
        },
    });

    return { wrapper, address };
};

const FIELDS: readonly AddressField[] = ['street', 'house_number', 'house_number_addition', 'postal_code', 'city'];

describe('AddressFields', () =>
{
    // One row per field, so each input's binding is checked on its own.
    it.for([
        { field: 'street', value: 'Oosterstraat' },
        { field: 'house_number', value: '123' },
        { field: 'house_number_addition', value: 'A' },
        { field: 'postal_code', value: '9711 LM' },
        { field: 'city', value: 'Groningen' },
    ] satisfies { field: AddressField; value: string }[])('should emit update:modelValue with a new address that differs only at its key, and leave the bound one untouched: $field', async ({ field, value }) =>
    {
        // Arrange
        const { wrapper, address } = mountAddressFields();

        // Act
        await wrapper.find(`#client-${field}`).setValue(value);

        // Assert (interaction): one event, carrying the whole new address
        expect(wrapper.emitted('update:modelValue')).toStrictEqual([[{ ...emptyAddress(), [field]: value }]]);

        // Assert (outcome): a new object, not an in-place write, so a parent
        // that doesn't listen for the event keeps its own value
        expect(address).toStrictEqual(emptyAddress());
    });

    it('should prefix every input id with the form name and point each label at its input', () =>
    {
        // Act
        const { wrapper } = mountAddressFields();

        // Assert: five inputs, each with a label, so a screen reader names every one
        const inputs = wrapper.findAll('input');
        expect(inputs.map((input) => input.attributes('id'))).toStrictEqual(FIELDS.map((field) => `client-${field}`));

        for (const field of FIELDS)
        {
            expect(wrapper.find(`label[for="client-${field}"]`).exists()).toBe(true);
        }
    });

    it('should mark every input required except the house number addition, as the backend does for a Dutch address', () =>
    {
        // Act
        const { wrapper } = mountAddressFields();

        // Assert: the attribute's presence is what the browser checks
        const required = wrapper.findAll('input').map((input) => input.attributes('required') !== undefined);
        expect(required).toStrictEqual([true, true, false, true, true]);
    });

    it('should show the error under its input and link it with aria-invalid and aria-describedby, leaving the other inputs clean', () =>
    {
        // Arrange: a fieldError stub with one error, the shape useForm builds after a 422
        const fieldError = (field: AddressField): FieldError | null =>
            field === 'postal_code' ? { message: 'The postal code field format is invalid.', id: 'client-postal_code-error' } : null;

        // Act
        const { wrapper } = mountAddressFields({ fieldError });

        // Assert: the error is shown, and its input points at it
        const input = wrapper.find('#client-postal_code');
        expect(wrapper.find('#client-postal_code-error').text()).toBe('The postal code field format is invalid.');
        expect(input.attributes('aria-invalid')).toBe('true');
        expect(input.attributes('aria-describedby')).toBe('client-postal_code-error');

        // Assert: the other inputs have no error and point nowhere
        for (const field of FIELDS.filter((field) => field !== 'postal_code'))
        {
            const other = wrapper.find(`#client-${field}`);
            expect(other.attributes('aria-invalid')).toBe('false');
            expect(other.attributes('aria-describedby')).toBeUndefined();
        }

        expect(wrapper.findAll('p')).toHaveLength(1);
    });

    it('should show no country select when only NL is offered, as on the business form', () =>
    {
        // Act
        const { wrapper } = mountAddressFields();

        // Assert: the street input proves the fields rendered at all
        expect(wrapper.find('#client-street').exists()).toBe(true);
        expect(wrapper.find('select').exists()).toBe(false);
    });

    it('should offer every country by its English name, sorted by name, with the address\'s country selected', () =>
    {
        // Act
        const { wrapper } = mountAddressFields({ countryCodes: COUNTRY_CODES });

        // Assert
        const select = wrapper.find<HTMLSelectElement>('#client-country_code');
        const names = select.findAll('option').map((option) => option.text());
        expect(names).toHaveLength(COUNTRY_CODES.length);
        expect(names).toContain('Germany');
        expect(names).toStrictEqual([...names].sort((first, second) => first.localeCompare(second, 'en')));
        expect(select.element.value).toBe('NL');
        expect(wrapper.find('label[for="client-country_code"]').text()).toBe('Country');
    });

    it('should offer and select the address\'s own country when the offered countries leave it out', () =>
    {
        // Act
        const { wrapper } = mountAddressFields({ countryCodes: ['NL', 'BE'], address: emptyGermanAddress() });

        // Assert: without DE as an option the browser would show Belgium
        // while the address still holds DE
        const select = wrapper.find<HTMLSelectElement>('#client-country_code');
        expect(select.findAll('option').map((option) => option.text())).toStrictEqual(['Belgium', 'Germany', 'Netherlands']);
        expect(select.element.value).toBe('DE');
    });

    it('should emit nothing when the select changes to a value that is not a country code', async () =>
    {
        // Arrange: an option the component never renders, as a browser
        // extension or a stale DOM could add
        const { wrapper } = mountAddressFields({ countryCodes: COUNTRY_CODES });
        const select = wrapper.find<HTMLSelectElement>('#client-country_code');
        select.element.append(new Option('Nowhere', 'XX'));

        // Act
        await select.setValue('XX');

        // Assert: the change did happen, so the missing event is the guard's doing
        expect(select.element.value).toBe('XX');
        expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    });

    it('should show Region and make the postcode optional after switching from NL to DE', async () =>
    {
        // Arrange
        const { wrapper } = mountAddressFields({ countryCodes: COUNTRY_CODES });
        expect(wrapper.find('#client-region').exists()).toBe(false);

        // Act
        await wrapper.find('#client-country_code').setValue('DE');

        // Assert (interaction): only the country changed
        expect(wrapper.emitted('update:modelValue')).toStrictEqual([[{ ...emptyAddress(), country_code: 'DE' }]]);

        // Assert (outcome)
        expect(wrapper.find('#client-region').exists()).toBe(true);
        expect(wrapper.find('#client-postal_code').attributes('required')).toBeUndefined();
    });

    it('should clear the region and turn a null postcode into an empty one after switching from DE back to NL, since a Dutch address has neither', async () =>
    {
        // Arrange
        const address = { ...emptyGermanAddress(), region: 'Bayern' };
        const { wrapper } = mountAddressFields({ countryCodes: COUNTRY_CODES, address });

        // Act
        await wrapper.find('#client-country_code').setValue('NL');

        // Assert (interaction)
        expect(wrapper.emitted('update:modelValue')).toStrictEqual([[{ ...emptyAddress(), country_code: 'NL' }]]);

        // Assert (outcome): the Dutch fields again
        expect(wrapper.find('#client-region').exists()).toBe(false);
        expect(wrapper.find('#client-postal_code').attributes('required')).toBeDefined();
    });

    it('should emit the region typed into a foreign address', async () =>
    {
        // Arrange
        const { wrapper } = mountAddressFields({ countryCodes: COUNTRY_CODES, address: emptyGermanAddress() });

        // Act
        await wrapper.find('#client-region').setValue('Bayern');

        // Assert
        expect(wrapper.emitted('update:modelValue')).toStrictEqual([[{ ...emptyGermanAddress(), region: 'Bayern' }]]);
    });

    it('should show a country error under the select and link it with aria-invalid and aria-describedby', () =>
    {
        // Arrange
        const fieldError = (field: AddressField): FieldError | null =>
            field === 'country_code' ? { message: 'The country code field must be a country code, like NL.', id: 'client-country_code-error' } : null;

        // Act
        const { wrapper } = mountAddressFields({ fieldError, countryCodes: COUNTRY_CODES });

        // Assert
        const select = wrapper.find('#client-country_code');
        expect(wrapper.find('#client-country_code-error').text()).toBe('The country code field must be a country code, like NL.');
        expect(select.attributes('aria-invalid')).toBe('true');
        expect(select.attributes('aria-describedby')).toBe('client-country_code-error');
    });
});
