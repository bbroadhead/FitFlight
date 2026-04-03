# FlightTrack - Air Force Squadron PT Tracker

A comprehensive fitness tracking and competition app designed for Air Force squadrons. Built with React Native and Expo SDK 53.

## Features

### Authentication System
- Email-based sign up/sign in with @us.af.mil validation (requires native email push functionality, and will not work in the web version)
- 3 account types with role-based permissions:
  - **FlightTrack Creator** (Owner): Full access and control
  - **UFPM**: Administrative access, can manage PTL status
  - **PTL**: Can edit PT attendance and schedule sessions
  - **Standard**: View-only for attendance
- Persistent login state across app restarts
- PTL status request workflow with in-app notifications
- **Welcome tutorial** for first-time users with 6 slides explaining app features

### Navigation
- **Swipe between tabs** - swipe left/right in the main screen area to change tabs
- Bottom tab navigation with 5 tabs: Leaderboard, Workouts, Attendance, Calculator, Profile

### Leaderboard Tab
- Real-time competition tracking across squadron
- Animated bar charts showing exercise minutes, distance run, and calories burned
- **Workout type analytics** - squadron-wide breakdown with animated bar graphs
- Tap any member to view their detailed profile
- Expandable view to see all members or top 10
- Squadron-wide statistics overview (workouts, hours, miles, calories)

### PT Attendance Tab
- Weekly attendance tracking organized by flight
- 8 flights: Avatar, Bomber, Cryptid, Doom, Ewok, Foxhound, ADF, DET
- Progress bar based on required sessions per week
- Configurable sessions requirement (1-4 per week based on FA score)
- PTL/UFPM/Owner editing permissions

### Fitness Assessment Calculator
- Dynamic scoring based on official Air Force FA standards
- Male/Female gender selection
- Multiple test options for each component

### Member Profiles
- View any member's profile from the leaderboard
- **Profile pictures** - displayed in profile card, tappable to upload in settings
- Fitness assessment history with score breakdown chart
- **Workout type breakdown** - per-user animated bar graph showing workout distribution
- **Workout uploads section** with privacy filtering
- **Achievements display** with full-screen modal view
  - Earned achievements shown with earned status
  - Locked achievements show name and earning conditions
  - Tap any achievement to view all achievements in full-screen modal
  - Progress bar showing earned vs total achievements
  - **Fixed header** - title and X button properly positioned for easy closing
- Expandable achievements summary (tap to see all earned achievements)
- Privacy settings for fitness assessments
- Leaderboard position display

### Workout Tracking
- Manual workout entry with type, duration, distance, calories
- Screenshot upload for record-keeping (manual data entry)
- Privacy toggle: public or private workouts
- Supported workout types: Running, Walking, Cycling, Strength, HIIT, Swimming, Sports
- Automatic stats aggregation
- FlightTrack Creator, UFPM, and PTL can view all workouts regardless of privacy setting

### Shared Workouts Tab
- Submit workouts for the squadron to discover and try
- Workout submission includes name, type, duration, intensity slider (1-10), description
- Multi-step workouts: add numbered steps with plus button, complete when finished
- Rating system: thumbs up/down buttons (greyed out until selected, can change vote)
- Favorite workouts for easy access
- Search workouts by name, description, or type
- Filter by: All, Favorites, My Workouts
- Sort by: Newest, Most Popular, Shortest Duration
- Filter by workout type
- Delete own workouts; UFPM/Owner can delete any workout

### Fitness Assessment Upload
- Upload official myFSS Fitness Tracker PDFs
- Manual entry option for assessment scores
- Component breakdown (Cardio, Push-ups, Sit-ups, Waist)
- Automatic PT requirement adjustment based on score:
  - 90+: 1 session/week
  - 80-89: 2 sessions/week
  - 75-79: 3 sessions/week
  - <75: 4 sessions/week
- Privacy toggle for assessments

### PT Session Scheduling (PTL/UFPM/Owner)
- Create future PT sessions with date picker
- Military time format
- Free text description
- Edit and delete existing sessions
- Flight-specific scheduling

### Roster Import (UFPM/Owner)
- Bulk import members from CSV or Excel files
- Auto-detects column headers (Rank, First Name, Last Name, Flight)
- Manual column mapping for files without headers
- Preview and validate before importing
- Skips duplicates automatically
- Supports common rank variations (SSgt, Staff Sergeant, etc.)

### Squadron Analytics (Owner/UFPM)
- Comprehensive squadron overview
- **Workout type breakdown** - animated bar graph showing distribution of workout types across squadron
- Flight-by-flight breakdown
- Top 5 performers list
- Export report as text file
- Export raw data as CSV

### Achievements System
- Leaderboard achievements (Gold, Silver, Bronze for monthly placement)
- Milestone achievements (First workout, 10/50/100 workouts, 100/500 miles)
- Streak achievements (Week warrior, Monthly machine)
- Fitness achievements (Excellent rating, Perfect score, Improvement)
- Full-screen celebration animation when earned
- Hard achievements have gold borders and show badges on profile/leaderboard
- Unearned achievements show name and earning conditions
- Tap any achievement to view full-screen achievements list
- Progress bar showing earned vs total achievements
- Category labels for each achievement

### Connected Apps & Integrations
- **Apple Health** - syncs workout data (primary integration)
- **Strava** - run & cycling tracking
- **Garmin** - GPS & fitness tracking
- **Disconnect integrations** - trash icon to disconnect without removing existing data
- Reconnect at any time from Profile settings

### Profile & Settings
- **Profile picture upload** - tap profile picture to take photo, choose from gallery, or remove
- **View Tutorial** button to replay the onboarding tutorial
- Change squadron functionality
- Sign out

## Account Types & Permissions

| Feature | Standard | PTL | UFPM | Owner |
|---------|----------|-----|------|-------|
| View Leaderboard | Yes | Yes | Yes | Yes |
| View Attendance | Yes | Yes | Yes | Yes |
| Edit Attendance | No | Yes | Yes | Yes |
| View All Workout Uploads | No | Yes | Yes | Yes |
| Schedule PT Sessions | No | Yes | Yes | Yes |
| Import Roster | No | No | Yes | Yes |
| Approve PTL Requests | No | No | Yes | Yes |
| Revoke PTL Status | No | No | Yes | Yes |
| Assign UFPM | No | No | No | Yes |
| View Analytics | No | No | Yes | Yes |
| Export Data | No | No | Yes | Yes |

## Tech Stack
- Expo SDK 53 with React Native 0.76.7
- NativeWind (TailwindCSS) for styling
- Zustand for state management with AsyncStorage persistence
- React Native Reanimated for smooth animations
- React Native Gesture Handler for swipe navigation
- Expo Haptics for tactile feedback
- date-fns for date manipulation
- expo-image-picker for screenshot upload
- expo-document-picker for PDF upload
- expo-file-system and expo-sharing for exports

## Color Scheme
- Air Force Blue (#00308F)
- Silver (#C0C0C0)
- Navy (#0A1628)
- Accent (#4A90D9)
- Gold (#FFD700)
- Success (#22C55E)
- Warning (#F59E0B)
- Danger (#EF4444)
