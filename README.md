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
|-- sitemap.xml
|-- .nojekyll
|-- about/
|   |-- index.html
|-- ventures/
|   |-- index.html
|-- partnerships/
|   |-- index.html
|-- founder-application/
|   |-- index.html
|-- builder-application/
|   |-- index.html
|-- partner-application/
|   |-- index.html
|-- edit-application/
|   |-- index.html
|-- insights/
|   |-- index.html
|-- contact/
|   |-- index.html
|-- legal/
|   |-- index.html
|-- success/
|   |-- index.html
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

This is a static website using clean folder URLs. Serve the folder with any local static server.

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

- `/founder-application/` saves Founder Partnership applications.
- `/builder-application/` saves Technology Builder applications.
- `/partner-application/` saves Strategic Partner applications.
- `/edit-application/` opens generated edit links with `id` and `token` query parameters.

The shared script is `assets/js/application-form.js`.

The application script is configured for Firebase and EmailJS. For production, keep Firestore and Firebase Storage security rules strict, and use the EmailJS templates listed below.

EmailJS templates must use these exact variables:

```text
{{application_id}}
{{application_type}}
{{applicant_name}}
{{applicant_email}}
{{phone}}
{{country}}
{{linkedin}}
{{github}}
{{portfolio}}
{{project_name}}
{{project_website}}
{{stage}}
{{message}}
{{edit_link}}
{{submitted_at}}
```
