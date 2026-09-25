import sys
from . import locations as loc
from .pipeline import generate

if __name__=='__main__':
    key, job = sys.argv[1:3]
    def progress(value):
        loc.write_json(loc.HOME/'jobs'/(job+'.json'),{'id':job,'location':key,**value})
    try:
        result=generate(key,progress,refresh='--refresh' in sys.argv)
        sys.exit(0 if result['state']=='completed' else 1)
    except Exception as error:
        progress({'state':'failed','message':type(error).__name__+': generation failed; previous package retained'})
        sys.exit(1)
