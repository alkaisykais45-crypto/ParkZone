# ParkZone

ParkZone is a mobile parking application built with React Native and Expo. The app is designed to help users discover parking locations, access location information, and manage parking-related data through a secure and simple mobile experience.

## Current Features

- Expo Router navigation
- ParkZone welcome and home screens
- Home screen map with search and menu controls
- Charger-station control with active and inactive states
- User authentication flows
- Sign in and sign up
- Password recovery and password reset
- OTP verification flow
- Supabase integration for authentication and application data
- Persistent authentication sessions using AsyncStorage
- NativeWind styling

## Planned Features

### QR Code Scanning

ParkZone will support QR code scanning for parking locations. Each QR code can identify a parking location and retrieve its associated data, such as:

- Location name and address
- Parking availability
- Parking rules and restrictions
- Opening hours
- Pricing information
- Available facilities
- Location-specific instructions

### Parking Location Management System

A management system will be added for authorized users or administrators to create and maintain parking location data. Planned capabilities include:

- Add new parking locations
- Edit existing location information
- Remove or deactivate locations
- Generate and manage QR codes for locations
- Update parking availability and status
- Manage pricing, rules, and opening hours
- Validate location data before it becomes publicly available

### Verification Environment

A separate verification environment will be introduced to test authentication, QR scanning, location data, and management workflows before changes are released to production. This environment will help verify:

- New location data
- QR code behavior
- User permissions
- Authentication and OTP flows
- Database changes
- API integrations
- Mobile application builds

## Technology Stack

- React Native
- Expo SDK 54
- Expo Router
- TypeScript
- NativeWind
- Supabase
- AsyncStorage

## Getting Started

### Requirements

- Node.js
- npm
- Expo-compatible development environment
- Expo Go or an Android/iOS simulator
- A Supabase project

### Installation

```bash
npm install
```

### Environment Variables

Create a `.env` file in the project root and add the Supabase values for your environment:

```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_project_url
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN=pk.your_public_mapbox_token
RNMAPBOX_MAPS_DOWNLOAD_TOKEN=sk.your_mapbox_download_token
```

Never commit `.env` files or private keys to the repository.

Create the two Mapbox tokens in the [Mapbox Console](https://console.mapbox.com/): use a public `pk...` token for the app and a secret `sk...` downloads token for native builds. The downloads token must have the `DOWNLOADS:READ` scope. Copy `.env.example` to `.env`, then run `npx expo prebuild` and use a development build; Mapbox is a native module and does not run in Expo Go.

### Run the Application

```bash
npm start
```

You can also run a platform-specific command:

```bash
npm run android
npm run ios
npm run web
```

## Project Structure

```text
app/          Application routes and screens
components/   Reusable React Native components
constants/    Shared colors, icons, and UI constants
hooks/        Custom React hooks
scripts/      Project and Supabase configuration scripts
```

## Development Workflow

1. Create a feature branch from `main`.
2. Implement and test the change locally.
3. Verify authentication, location data, and UI behavior.
4. Test planned management and QR workflows in the verification environment.
5. Open a pull request for review.
6. Merge approved changes into `main`.

## Status

ParkZone is under active development. Authentication and the initial application structure are in place. QR scanning, parking location management, and the verification environment are planned additions.

## License

This project does not currently specify a license.
