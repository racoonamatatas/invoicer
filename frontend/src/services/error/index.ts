import { computed, ref } from 'vue';

interface ErrorBag
{
    [property: string]: string[];
}

const errorBag = ref<ErrorBag>({});
const message = ref('');

export const getErrorBag = computed(() => errorBag.value);
export const getMessage = computed(() => message.value);

export const getErrorByProperty = (property: string) => computed(() => errorBag.value[property]);

export const setErrorBag = (bag: ErrorBag) => (errorBag.value = bag);

export const setMessage = (newMessage: string) =>
{
    message.value = newMessage || 'An error has occurred.';
};

export const destroyErrors = () => (errorBag.value = {});

export const destroyMessage = () => (message.value = '');
