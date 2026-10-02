<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{ config('app.name') }}</title>
</head>

<body>
    <div id="app"></div>
    {{-- Dev only: scripts come live from the Vite dev server. Production (manifest.json) comes with deployment. --}}
    <script type="module" src="http://localhost:3000/@@vite/client"></script>
    <script type="module" src="http://localhost:3000/src/main.ts"></script>
</body>

</html>
