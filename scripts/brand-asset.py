from PIL import Image
im=Image.open('Designs/auth & onboarding/image-gen-1(10).png')
im.crop((842,141,1057,195)).save('public/assets/brand-purple.png')
