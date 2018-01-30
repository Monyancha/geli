import {
  Body, Get, Put, Delete, Param, JsonController, UseBefore, NotFoundError, BadRequestError, Post,
  Authorized, UploadedFile
} from 'routing-controllers';
import fs = require('fs');
import passportJwtMiddleware from '../security/passportJwtMiddleware';
import crypto = require('crypto');

import {Lecture} from '../models/Lecture';
import {IUnitModel, Unit} from '../models/units/Unit';
import {IUnit} from '../../../shared/models/units/IUnit';
import {IFileUnit} from '../../../shared/models/units/IFileUnit';
import {ValidationError} from 'mongoose';

const multer = require('multer');

const uploadOptions = {
  storage: multer.diskStorage({
    destination: (req: any, file: any, cb: any) => {
      cb(null, 'uploads/');
    },
    filename: (req: any, file: any, cb: any) => {
      const extPos = file.originalname.lastIndexOf('.');
      const ext = (extPos !== -1) ? `.${file.originalname.substr(extPos + 1).toLowerCase()}` : '';
      crypto.pseudoRandomBytes(16, (err, raw) => {
        cb(err, err ? undefined : `${raw.toString('hex')}${ext}`);
      });
    }
  }),
};

@JsonController('/units')
@UseBefore(passportJwtMiddleware)
export class UnitController {

  /**
   * @api {get} /api/units/:id Request unit
   * @apiName GetUnit
   * @apiGroup Unit
   *
   * @apiParam {String} id Unit ID.
   *
   * @apiSuccess {Unit} unit Unit.
   *
   * @apiSuccessExample {json} Success-Response:
   *     {
   *         "_id": "5a037e6b60f72236d8e7c858",
   *         "updatedAt": "2017-11-08T22:00:11.500Z",
   *         "createdAt": "2017-11-08T22:00:11.500Z",
   *         "name": "What is Lorem Ipsum?",
   *         "description": "...",
   *         "markdown": "# What is Lorem Ipsum?\n**Lorem Ipsum** is simply dummy text of the printing and typesetting industry.",
   *         "_course": "5a037e6b60f72236d8e7c83b",
   *         "type": "free-text",
   *         "__v": 0
   *     }
   */
  @Get('/:id')
  getUnit(@Param('id') id: string) {
    return Unit.findById(id)
    .then((u) => u.toObject());
  }

  /**
   * @api {post} /api/units/ Add unit
   * @apiName PostUnit
   * @apiGroup Unit
   * @apiPermission teacher
   * @apiPermission admin
   *
   * @apiParam {Object} file Uploaded file.
   * @apiParam {Object} data New unit data.
   *
   * @apiSuccess {Unit} unit Added unit.
   *
   * @apiSuccessExample {json} Success-Response:
   *     {
   *         "_id": "5a037e6b60f72236d8e7c858",
   *         "updatedAt": "2017-11-08T22:00:11.500Z",
   *         "createdAt": "2017-11-08T22:00:11.500Z",
   *         "name": "What is Lorem Ipsum?",
   *         "description": "...",
   *         "markdown": "# What is Lorem Ipsum?\n**Lorem Ipsum** is simply dummy text of the printing and typesetting industry.",
   *         "_course": "5a037e6b60f72236d8e7c83b",
   *         "type": "free-text",
   *         "__v": 0
   *     }
   *
   * @apiError BadRequestError Invalid combination of file upload and unit data.
   * @apiError BadRequestError No lecture ID was submitted.
   * @apiError BadRequestError No unit was submitted.
   * @apiError BadRequestError Unit has no _course set.
   * @apiError BadRequestError
   * @apiError ValidationError
   */
  @Authorized(['teacher', 'admin'])
  @Post('/')
  addUnit(@UploadedFile('file', {options: uploadOptions}) file: any, @Body() data: any) {
    if (file) {
      try {
        data = JSON.parse(data.data);
      } catch (error) {
        throw new BadRequestError('Invalid combination of file upload and unit data.');
      }
    }

    // discard invalid requests
    this.checkPostParam(data, file);

    if (file) {
      data.model = this.handleUploadedFile(file, data.model);
    }

    return Unit.create(data.model)
    .then((createdUnit) => {
      return this.pushToLecture(data.lectureId, createdUnit);
    })
    .catch((err) => {
      if (file) {
        fs.unlinkSync(file.path);
      }

      if (err.name === 'ValidationError') {
        throw err;
      } else {
        throw new BadRequestError(err);
      }
    });
  }

  /**
   * @api {put} /api/units/:id Update unit
   * @apiName PutUnit
   * @apiGroup Unit
   * @apiPermission teacher
   * @apiPermission admin
   *
   * @apiParam {Object} file Uploaded file.
   * @apiParam {String} id Unit ID.
   * @apiParam {Object} data New unit data.
   *
   * @apiSuccess {Unit} unit Updated unit.
   *
   * @apiSuccessExample {json} Success-Response:
   *     {
   *         "_id": "5a037e6b60f72236d8e7c858",
   *         "updatedAt": "2018-01-29T23:43:07.220Z",
   *         "createdAt": "2017-11-08T22:00:11.500Z",
   *         "name": "What is Lorem Ipsum?",
   *         "description": "...",
   *         "markdown": "# What is Lorem Ipsum?\n**Lorem Ipsum** is simply dummy text of the printing and typesetting industry.",
   *         "_course": "5a037e6b60f72236d8e7c83b",
   *         "type": "free-text",
   *         "__v": 0
   *     }
   *
   * @apiError NotFoundError
   * @apiError BadRequestError Invalid combination of file upload and unit data.
   * @apiError BadRequestError
   * @apiError ValidationError
   */
  @Authorized(['teacher', 'admin'])
  @Put('/:id')
  async updateUnit(@UploadedFile('file', {options: uploadOptions}) file: any, @Param('id') id: string, @Body() data: any) {
    const oldUnit: IUnitModel = await Unit.findById(id);

    if (!oldUnit) {
      throw new NotFoundError();
    }

    if (file) {
      try {
        data = JSON.parse(data.data);
        data = await this.handleUploadedFile(file, data.model);
      } catch (error) {
        throw new BadRequestError('Invalid combination of file upload and unit data.');
      }
    }

    try {
      oldUnit.set(data);
      const updatedUnit: IUnitModel = await oldUnit.save();
      return updatedUnit.toObject();
    } catch (err) {
      if (err.name === 'ValidationError') {
        throw err;
      } else {
        throw new BadRequestError(err);
      }
    }
  }

  /**
   * @api {delete} /api/units/:id Delete unit
   * @apiName DeleteUnit
   * @apiGroup Unit
   * @apiPermission teacher
   * @apiPermission admin
   *
   * @apiParam {String} id Unit ID.
   *
   * @apiSuccess {Boolean} result Confirmation of deletion.
   *
   * @apiSuccessExample {json} Success-Response:
   *     {
   *         "result": true
   *     }
   *
   * @apiError NotFoundError
   */
  @Authorized(['teacher', 'admin'])
  @Delete('/:id')
  deleteUnit(@Param('id') id: string) {
    return Unit.findById(id).then((unit) => {
      if (!unit) {
        throw new NotFoundError();
      }

      return Lecture.update({}, {$pull: {units: id}})
        .then(() => unit.remove())
        .then(() => {
          return {result: true};
        });
    });
  }

  protected pushToLecture(lectureId: string, unit: any) {
    return Lecture.findById(lectureId)
      .then((lecture) => {
        lecture.units.push(unit);
        return lecture.save();
      })
      .then(() => {
        return unit.toObject();
      })
      .catch((err) => {
        throw new BadRequestError(err);
      });
  }

  protected checkPostParam(data: any, file?: any) {
    try {
      if (!data.lectureId) {
        throw new BadRequestError('No lecture ID was submitted.');
      }

      if (!data.model) {
        throw new BadRequestError('No unit was submitted.');
      }

      if (!data.model._course) {
        throw new BadRequestError('Unit has no _course set');
      }
    } catch (error) {
      if (file) {
        fs.unlinkSync(file.path);
      }
      throw error;
    }
  }

  private handleUploadedFile(file: any, unit: IFileUnit): IUnit {
    if (!unit.hasOwnProperty('files')) {
      unit.files = []
    }

    unit.files.push({path: file.path, name: file.filename, alias: file.originalname, size: file.size});
    return unit;
  }
}
