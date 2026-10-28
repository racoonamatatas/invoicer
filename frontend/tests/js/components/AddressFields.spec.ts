import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';

import AddressFields from '@/components/AddressFields.vue';
import type { FieldError } from '@/composables/useForm';
import type { Address, AddressField } from '@/services/address';

const emptyAddress = (): Address => ({
    street: '',
    house_number: '',
    house_number_addition: null,
    postal_code: '',
    city: '',
});

// Mounts AddressFields the way a parent form does: an address object bound
// with v-model, the parent's form name, and its fieldError.
const mountAddressFields = (fieldError: (field: AddressField) => FieldError | null = () => null) =>
{
    const address = emptyAddress();
    const wrapper = mount(AddressFields, { props: { modelValue: address, formName: 'business', fieldError } });

    return { wrapper, address };
};

const FIELDS: readonly AddressField[] = ['street', 'house_number', 'house_number_addition', 'postal_code', 'city'];

describe('AddressFields', () =>
{
    // One row per field, so each input's binding is checked on its own.
    it.for([
        { field: 'street', value: 'Keizersgracht' },
        { field: 'house_number', value: '123' },
        { field: 'house_number_addition', value: 'A' },
        { field: 'postal_code', value: '1015 CJ' },
        { field: 'city', value: 'Amsterdam' },
    ] satisfies { field: AddressField; value: string }[])('should write what is typed into its key of the bound address: $field', async ({ field, value }) =>
    {
        // Arrange
        const { wrapper, address } = mountAddressFields();

        // Act
        await wrapper.find(`#business-${field}`).setValue(value);

        // Assert: the parent's own object changed, only at this key
        expect(address).toStrictEqual({ ...emptyAddress(), [field]: value });
    });

    it('should prefix every input id with the form name and point each label at its input', () =>
    {
        // Act
        const { wrapper } = mountAddressFields();

        // Assert: five inputs, each with a label, so a screen reader names every one
        const inputs = wrapper.findAll('input');
        expect(inputs.map((input) => input.attributes('id'))).toStrictEqual(FIELDS.map((field) => `business-${field}`));

        for (const field of FIELDS)
        {
            expect(wrapper.find(`label[for="business-${field}"]`).exists()).toBe(true);
        }
    });

    it('should show the error under its input and link it with aria-invalid and aria-describedby, leaving the other inputs clean', () =>
    {
        // Arrange: a fieldError stub with one error, the shape useForm builds after a 422
        const fieldError = (field: AddressField): FieldError | null =>
            field === 'postal_code' ? { message: 'The postal code field format is invalid.', id: 'business-postal_code-error' } : null;

        // Act
        const { wrapper } = mountAddressFields(fieldError);

        // Assert: the error is shown, and its input points at it
        const input = wrapper.find('#business-postal_code');
        expect(wrapper.find('#business-postal_code-error').text()).toBe('The postal code field format is invalid.');
        expect(input.attributes('aria-invalid')).toBe('true');
        expect(input.attributes('aria-describedby')).toBe('business-postal_code-error');

        // Assert: the other inputs have no error and point nowhere
        for (const field of FIELDS.filter((field) => field !== 'postal_code'))
        {
            const other = wrapper.find(`#business-${field}`);
            expect(other.attributes('aria-invalid')).toBe('false');
            expect(other.attributes('aria-describedby')).toBeUndefined();
        }

        expect(wrapper.findAll('p')).toHaveLength(1);
    });
});
