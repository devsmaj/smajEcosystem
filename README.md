# SMAJ Ecosystem

## Building Future Technology Companies

SMAJ Ecosystem is a startup technology company and venture-building platform focused on creating, building, partnering, and scaling future technology companies.

The website presents SMAJ as a parent ecosystem for products, labs, ventures, strategic partners, and future companies. Its positioning is inspired by venture builders and startup studios: clear company vision, portfolio-style venture pages, partnership paths, insights, and direct collaboration channels.

## Core Message

SMAJ transforms ideas into products, products into ventures, and ventures into companies.

The ecosystem is built around four operating pillars:

- **SMAJ Labs** - research, experiments, emerging technology, and new product concepts.
- **SMAJ Ventures** - company creation, venture planning, launches, and growth.
- **SMAJ Partners** - founder, builder, business, and strategic partnerships.
- **SMAJ Products** - digital platforms, AI tools, software products, and ecosystem-owned projects.

## Website Pages

- **Home** - hero, ecosystem overview, venture-builder positioning, featured ventures, and insights.
- **About** - mission, values, structure, and leadership.
- **Ventures** - portfolio-style grid for SMAJ Ecosystem, Labs, Ventures, Partners, products, and future companies.
- **Partnerships** - founder, technology, and strategic partnership paths with dedicated application forms.
- **Insights** - articles and updates about startup building, AI, innovation, and SMAJ's journey.
- **Contact** - contact details, social links, map, and partnership form.
- **Legal** - privacy policy, terms of service, cookie policy, and disclaimer.
- **Success** - confirmation page for received messages.
- **Founder Application** - founder/startup application form with file upload fields.
- **Builder Application** - developer, AI builder, designer, and product collaborator application form.
- **Partner Application** - strategic company or organization partnership application form.
- **Edit Application** - tokenized application review page for generated edit links.

## Technology Stack

- HTML5
- CSS3
- JavaScript
- Responsive design
- Boxicons
- Google Fonts
- Static website architecture

## Project Structure

```text
smajEcosystem/
|-- index.html
|-- about.html
|-- ventures.html
|-- partnerships.html
|-- founder-application.html
|-- builder-application.html
|-- partner-application.html
|-- edit-application.html
|-- insights.html
|-- contact.html
|-- legal.html
|-- success.html
|-- README.md
|-- assets/
    |-- css/
    |   |-- style.css
    |-- js/
    |   |-- main.js
    |   |-- navigation.js
    |   |-- projects-filter.js
    |   |-- application-form.js
    |-- images/
        |-- logo.jpg
        |-- logo.svg
        |-- ceo.jpg
        |-- coo.jpg
        |-- team-rohid.jpg
        |-- smajstore.png
        |-- smajpihub.mp4
```

## Running Locally

This is a static website. Open `index.html` directly in a browser, or serve the folder with any local static server.

Example:

```bash
python -m http.server 8000
```

Then visit:

```text
http://localhost:8000
```

## Current Status

The site is fully built as a responsive static SMAJ Ecosystem website with completed pages, shared navigation, mobile menu behavior, scroll animations, venture filtering, insight filtering, dedicated application forms, contact form UI, and legal content.

## Application System

The application pages are ready for a GitHub Pages + Firebase setup:

- `founder-application.html` saves Founder Partnership applications.
- `builder-application.html` saves Technology Builder applications.
- `partner-application.html` saves Strategic Partner applications.
- `edit-application.html` opens generated edit links with `id` and `token` query parameters.

The shared script is `assets/js/application-form.js`.

By default, Firebase and EmailJS keys are empty. In that state, forms generate an application ID and save a local demo record in the browser. To make the system production-ready, add a Firebase project config, configure Firestore security rules, configure Firebase Storage rules, and add EmailJS service/template IDs or replace the email hook with Firebase Cloud Functions and an email provider.
