# Composes onboarding story backgrounds from the designs (clean art under our text, design photo elsewhere).
set -e
compose() { # url design art out
  COLUMN_UNTIL=".setup-features>div" MSYS_NO_PATHCONV=1 node scripts/compose-story.mjs "$1" "Designs/auth & onboarding/$2.png" .setup-story \
    ".setup-story .eyebrow,.setup-steps,.setup-story h1,.setup-story-description,.setup-features .icon-tile,.setup-features b,.setup-features small,.setup-proof" \
    "public/assets/regenerated/$3.png" "public/assets/story/$4.png" 1536 1024
}
compose "/preview/onboarding" "Gala Dock Event Onboarding Dashboard" story-experience onb-experience
compose "/preview/onboarding/customer?step=1" "Gala Dock Preferences Setup" story-preferences onb-preferences
compose "/preview/onboarding/organizer?step=1" "Gala Dock Organizer Workspace Setup" story-organizer-business onb-organizer-business
compose "/preview/onboarding/organizer?step=2" "Gala Dock Event Setup Dashboard" story-organizer-events onb-organizer-events
compose "/preview/onboarding/organizer?step=3" "Gala·Dock Organizer Setup Dashboard" story-organizer-brand onb-organizer-brand
compose "/preview/onboarding/organizer?step=4" "GalaDock Organizer Setup Dashboard" story-organizer-team onb-organizer-team
compose "/preview/onboarding/provider?step=1" "Gala Dock Provider Setup Dashboard" story-provider-business onb-provider-business
compose "/preview/onboarding/provider?step=2" "Gala Dock Venue Setup Dashboard" story-provider-listing onb-provider-listing
compose "/preview/onboarding/provider?step=3" "Gala-Dock Provider Setup Dashboard" story-provider-rules onb-provider-rules
compose "/preview/onboarding/provider?step=4" "Gala Dock Provider Setup Dashboard(1)" story-provider-publish onb-provider-publish
